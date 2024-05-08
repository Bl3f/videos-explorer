import { pipeline, env } from '@xenova/transformers';
env.allowLocalModels = false;

/**
 * This class uses the Singleton pattern to ensure that only one instance of the
 * pipeline is loaded. This is because loading the pipeline is an expensive
 * operation and we don't want to do it every time we want to translate a sentence.
 */
class MyExtractorPipeline {
    static task = 'feature-extraction';
    static model = 'mixedbread-ai/mxbai-embed-large-v1';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {progress_callback});
        }

        return this.instance;
    }
}

// Listen for messages from the main thread
// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', async (event) => {
    // Retrieve the translation pipeline. When called for the first time,
    // this will load the pipeline and save it for future use.
    let extractor = await MyExtractorPipeline.getInstance(x => {
        // We also add a progress callback to the pipeline so that we can
        // track model loading.
        // eslint-disable-next-line no-restricted-globals
        self.postMessage(x);
    });

    // Actually perform the translation
    let output = await extractor(event.data.text, { pooling: 'mean', normalize: true });

    // eslint-disable-next-line no-restricted-globals
    self.postMessage({
        status: 'complete',
        output: JSON.stringify(output),
    });
});