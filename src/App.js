import './App.css';
import {useEffect, useRef, useState} from "react";
import Player from "./components/Player";
import DuckDBClient from "./utils/DuckDB";

function App() {
  const [videos, setVideos] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Model loading
  const [ready, setReady] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [progressItems, setProgressItems] = useState([]);

  // Inputs and outputs
  const [input, setInput] = useState('');
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
      .then((data) => Object.fromEntries((new Map(data.map((video) => [video.id, video])))))
      .then((data) => setVideos(data))
      .then(() => setLoading(false));
  }, []);

  const connectAndGetVersion = async () => {
    setReady(false);
    const version = await client.version();
    const db = await client.db();
    setVersion(version);
    setDB(db);
    await client.query(`CREATE TABLE IF NOT EXISTS segments AS FROM read_parquet('http://localhost:8000/segments.parquet');`)
    await client.query("INSTALL fts;");
    await client.query("LOAD fts;");
    await client.query("PRAGMA create_fts_index('segments', 'row_id', 'text', overwrite=1)");
    setReady(true);
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
      ALTER TABLE segments alter column encoded set data type FLOAT[1024];
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

  const search = async () => {
    setReady(false)
    const results = await client.query(`
      WITH raw_events AS (
        SELECT
          video_id,
          id, 
          text,
          start,
          "end",
          COALESCE(CAST((LEAD(id, -1) OVER (PARTITION BY video_id ORDER BY id ASC) - id < -15) AS INT), 0) AS is_not_same_session,
          score 
        FROM (
          SELECT *, fts_main_segments.match_bm25(
            row_id, 
            '${input}'
          ) AS score FROM segments
        ) sq 
        WHERE
          score is not null AND score > 2
        ORDER BY video_id, id
      ),
      
      sessions AS (
        SELECT
          video_id,
          id,
          start,
          "end",
          SUM(is_not_same_session) OVER (PARTITION BY video_id ORDER BY id ASC) AS session_id
        FROM raw_events
      ),
      
      sessions_details AS (
        SELECT
          video_id,
          {'session_id': session_id, 'start_id': MIN(id) - 5, 'end_id': MAX(id) + 5, 'start': MIN(start), 'end': MAX("end")} AS session_detail
        FROM sessions
        GROUP BY video_id, session_id
      )
      
      SELECT
        video_id, ARRAY_AGG(session_detail) AS sessions, COUNT() AS nb
      FROM sessions_details
      GROUP BY video_id
      ORDER BY nb DESC
    `);
    setQueryResults(results);
    setReady(true);
  }

  return (
    <div className="App">
      <header>
        <h1>Data Council 2024</h1>
        <h2>Highlights <span className="subtitle">unofficial (by blef and juhache)</span></h2>
      </header>
      <div className="content">
        <div className="search">
          <input
            type="text"
            value={input}
            placeholder={"Search for a concept"}
            disabled={ready ? '' : 'disabled'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {if(e.key === 'Enter') search()}}
          />
          <input type="button" disabled={ready ? '' : 'disabled'} onClick={search} value="search"/>
        </div>
        <div className="wrapper">
          <div className="results">
            {queryResults.values.map((result) => (
              <div
                className={`video ${selectedVideo && selectedVideo.id === result.video_id ? 'selected' : ''}`}
                key={result.video_id}
                onClick={() => setSelectedVideo(videos[result.video_id])}
              >
                <img src={videos[result.video_id].thumbnail} alt=""/>
                <div className="details">
                  <div className="title">{videos[result.video_id].title}</div>
                  <div>{parseInt(result.nb)} occurrences</div>
                </div>
              </div>
            ))}
          </div>
          <div className="player" style={{display: `${selectedVideo ? 'block' : 'none'}`}}>
            {
              selectedVideo ?
              <Player
                key={`player-${selectedVideo.id}`}
                video={selectedVideo}
                segments={queryResults.values ? queryResults.values.find((item) => item.video_id === selectedVideo.id) : []}
              />
              : ""
            }
          </div>
        </div>
      </div>
      {/*{loading ? "loading..." : ""}
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
      </div>*/}
    </div>
  );
}

export default App;
