import './App.css';
import {useEffect, useState} from "react";
import Player from "./components/Player";
import DuckDBClient from "./utils/DuckDB";
import {ADMIN_MODE, HIGHLIGHTS_MODE, SEARCH_MODE} from "./consts";


function App() {
  const [mode, setMode] = useState(SEARCH_MODE);
  const [videos, setVideos] = useState({});
  const [state, setState] = useState({loading: true, ready: false});
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Inputs and outputs
  const [input, setInput] = useState('');

  // DuckDB stuff
  const [setVersion] = useState(null);
  const [queryResults, setQueryResults] = useState({headers: [], values: []});
  const [, setDB] = useState(null);
  const [client] = useState(new DuckDBClient());

  //Highlights main state
  const [highlights, setHighlights] = useState(window.localStorage.getItem("highlights") ? JSON.parse(window.localStorage.getItem("highlights")) : {});

  useEffect(() => {
    fetch("https://storage.googleapis.com/videos-explorer/videos.json")
      .then((response) => response.json())
      .then((data) => Object.fromEntries((new Map(data.map((video) => [video.id, video])))))
      .then((data) => setVideos(data));
  }, []);

  const connectAndGetVersion = async () => {
    setState({...state, ready: false});
    const version = await client.version();
    const db = await client.db();
    setVersion(version);
    setDB(db);
    await client.query(`CREATE TABLE IF NOT EXISTS segments AS (SELECT video_id, id, row_id, start, "end", text FROM read_parquet('https://storage.googleapis.com/videos-explorer/segments.parquet'));`)
    await client.query("INSTALL fts;");
    await client.query("LOAD fts;");
    await client.query("PRAGMA create_fts_index('segments', 'row_id', 'text', overwrite=1)");
    setState({loading: false, ready: true});
  }

  useEffect(() => {
    connectAndGetVersion();
  });

  const search = async () => {
    setMode(SEARCH_MODE);
    setState({...state, ready: false});
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
    setState({...state, ready: true});
  }

  const handleHighlightsCreation = (highlight) => {
    const previousValue = (highlight.video_id in highlights) ? highlights[highlight.video_id] : [];
    setHighlights({...highlights, [highlight.video_id]: [...previousValue, highlight]});
    window.localStorage.setItem("highlights", JSON.stringify({...highlights, [highlight.video_id]: [...previousValue, highlight]}));
  }

  return (
    <div className="App">
      <header>
        <h1>Data Council 2024</h1>
        <h2><span onClick={() => setMode(ADMIN_MODE)}>Highlights</span> <span className="subtitle">unofficial (by blef and juhache)</span></h2>
        {ADMIN_MODE === mode ? <pre>admin mode</pre> : ''}
      </header>
      <div className="content">
        <div className="summary">In this app you can search for concepts or watch highlights we handpicked in the 80 data councils videos. Data Council highlights is an application designed and developed by blef and juhache. This is not affiliated to the Data Council.</div>
        {state.loading ? "App is initializing..." : ""}
        {!state.loading  ?
        <div className="search">
          <input
            type="text"
            value={input}
            placeholder={"Search for a concept"}
            disabled={state.ready ? '' : 'disabled'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {if(e.key === 'Enter') search()}}
          />
          <input type="button" disabled={state.ready ? '' : 'disabled'} onClick={search} value="search"/>
          <div><span style={{marginRight: '10px'}}>•</span><input type="button" disabled={state.ready ? '' : 'disabled'} onClick={() => setMode(HIGHLIGHTS_MODE)} value="watch highlights"/></div>
        </div>
          : ''}
        <div className="wrapper">
          <div className="results">
            {mode === SEARCH_MODE && queryResults.values.map((result) => (
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
            {mode === ADMIN_MODE && Object.entries(videos).map(([videoId, video]) => (
              <div
                className={`video ${selectedVideo && selectedVideo.id === video.id ? 'selected' : ''}`}
                key={video.id}
                onClick={() => setSelectedVideo(video)}
              >
                <img src={video.thumbnail} alt=""/>
                <div className="details">
                  <div className="title">{video.title}</div>
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
                mode={mode}
                setHighlights={handleHighlightsCreation}
                highlights={highlights[selectedVideo.id]}
              />
              : ""
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
