import './App.css';
import {useEffect, useRef, useState} from "react";
import Player from "./components/Player";
import DuckDBClient from "./utils/DuckDB";

function App() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Model loading
  const [ready, setReady] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const [progressItems, setProgressItems] = useState([]);

  // Inputs and outputs
  const [input, setInput] = useState('DuckDB');
  const [output, setOutput] = useState('');

  // DuckDB stuff
  const [version, setVersion] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [queryResults, setQueryResults] = useState({headers: [], values: []});
  const [db, setDB] = useState(null);
  const [client, setClient] = useState(new DuckDBClient());

  const worker = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8000/videos.json")
      .then((response) => response.json())
      .then((data) => setVideos(data))
      .then(() => setLoading(false));
  }, []);

  const connectAndGetVersion = async () => {
    const version = await client.version();
    const db = await client.db();
    setVersion(version);
    setDB(db);
  }

  useEffect(() => {
    connectAndGetVersion();
  }, []);

  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module'
      });
    }

    const onMessageReceived = (e) => {
      console.log("event", e.data.status, e);
      switch (e.data.status) {
        case 'initiate':
          // Model file start load: add a new progress item to the list.
          setReady(false);
          setProgressItems(prev => [...prev, e.data]);
          break;

        case 'progress':
          // Model file progress: update one of the progress items.
          setProgressItems(
            prev => prev.map(item => {
              if (item.file === e.data.file) {
                return {...item, progress: e.data.progress}
              }
              return item;
            })
          );
          break;

        case 'done':
          // Model file loaded: remove the progress item from the list.
          setProgressItems(
            prev => prev.filter(item => item.file !== e.data.file)
          );
          break;

        case 'ready':
          // Pipeline ready: the worker is ready to accept messages.
          setReady(true);
          break;

        case 'update':
          // Generation update: update the output text.
          setOutput(e.data.output);
          break;

        case 'complete':
          // Generation complete: re-enable the "Translate" button
          setDisabled(false);
          setOutput(JSON.parse(e.data.output));
          break;
      }
    }

    worker.current.addEventListener('message', onMessageReceived);

    return () => worker.current.removeEventListener('message', onMessageReceived);
  });

  const computeEmbedding = async () => {
    // Disable the "Translate" button
    setDisabled(true);

    // Send the input text to the worker
    // worker.current.postMessage({text: input});
    await client.query(`
      CREATE TABLE segments AS FROM read_parquet('http://localhost:8000/segments.parquet');
      alter table segments alter column encoded set data type FLOAT[1024];
    `)
    let results;
    results = await client.query("DESCRIBE TABLE segments");
    setQueryResults(results);
    await client.query("INSTALL vss;");
    await client.query("LOAD vss;");
    console.log("creating index")
    await client.query(`
      CREATE INDEX idx ON segments USING HNSW (encoded);
    `);
    console.log("done index")
    // const results = await client.query(`
    //     SELECT video_id, ARRAY_AGG(id) AS ids
    //     FROM read_parquet('http://localhost:8000/segments.parquet')
    //     WHERE contains(text, '${input}')
    //     GROUP BY video_id
    // `);
    results = await client.query(`
      SHOW ALL TABLES;
    `);
    setQueryResults(results);
  }

  console.log(output);
  console.log(queryResults);

  return (
    <div className="App">
      <h1>Data Council 2024 — unofficial recommendations by <a href="https://blef.fr">blef.fr</a></h1>
      {loading ? "loading..." : ""}
      <div className="content">
        <div className="wrapper">
          <div className="videos">
            {videos.map((video) => (
              <div
                key={video.id}
                className={`yt-card ${selectedVideo && selectedVideo.id == video.id ? 'selected' : ''}`}
                onClick={() => setSelectedVideo(video)}
              >
                <div className="left">
                  <img src={video.thumbnail} alt=""/>
                  <div className="stats">
                    <span>👀 {video.views}</span>
                    <span>{video.duration.replace("PT", "").replace("M", ":").replace("S", "")}</span>
                  </div>
                </div>
                <h2 className="right">{video.title}</h2>
              </div>
            ))}
          </div>
        </div>
        <div className="player">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}/>
          {version}
          {ready === false && (
            <label>Loading models... (only run once)</label>
          )}
          {progressItems.map(data => (
            <div key={data.file}>{data.file} {data.progress}%</div>
          ))}
          <button disabled={disabled} onClick={computeEmbedding}>Get embedding</button>
          <pre>Output: --</pre>
          {selectedVideo ? <Player key={`player-${selectedVideo.id}`} video={selectedVideo}/> : ""}
        </div>
      </div>
    </div>
  );
}

export default App;
