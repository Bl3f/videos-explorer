import './App.css';
import {useEffect, useState} from "react";
import Player from "./components/Player";
import DuckDBClient from "./utils/DuckDB";
import {ADMIN_MODE, HIGHLIGHTS_MODE, SEARCH_MODE} from "./consts";
import {useSearchParams} from "react-router-dom";


function App() {
  // available searchParams possible
  // search term, videoId
  const [searchParams, setSearchParams] = useSearchParams();


  const [mode, setMode] = useState(SEARCH_MODE);
  const [videos, setVideos] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Inputs and outputs
  const [input, setInput] = useState(searchParams.get("search") || "");

  // DuckDB stuff
  const [, setVersion] = useState(null);
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
    const version = await client.version();
    const db = await client.db();
    setVersion(version);
    setDB(db);
    await client.query(`CREATE TABLE IF NOT EXISTS segments AS (SELECT video_id, id, row_id, start, "end", text FROM read_parquet('https://storage.googleapis.com/videos-explorer/segments.parquet'));`)
    await client.query("INSTALL fts;");
    await client.query("LOAD fts;");
    await client.query("PRAGMA create_fts_index('segments', 'row_id', 'text', overwrite=1)");
    setInitialized(true);
  }

  useEffect(() => {
    if (initialized && input) {
      search();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  useEffect(() => {
    if (selectedVideo) {
      setSearchParams({...Object.fromEntries(searchParams.entries()), videoId: selectedVideo.id});
    }
  }, [selectedVideo, searchParams, setSearchParams]);

  useEffect(() => {
    const videoId = searchParams.get("videoId");
    if (videoId) {
      setSelectedVideo(videos[videoId]);
    }
  }, [videos, searchParams]);

  useEffect(() => {
    connectAndGetVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAndSearch = (term) => {
    setInput(term);
    search(term);
  }

  const search = async (term=null) => {
    const searchTerm = term || input;
    const FTS = 'fts';
    const CONTAINS = 'contains';
    let mode = FTS;

    if (searchTerm.startsWith('"') && searchTerm.endsWith('"')) {
      mode = CONTAINS;
    }

    setMode(SEARCH_MODE);
    setRunning(true);
    const results = await client.query(`
      WITH raw_events_fts AS (
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
            '${searchTerm}'
          ) AS score FROM segments
        ) sq 
        WHERE
          score is not null AND score > 2
        ORDER BY video_id, id
      ),
          
      raw_events_contains AS (
          SELECT
            video_id,
            id, 
            text,
            start,
            "end",
            COALESCE(CAST((LEAD(id, -1) OVER (PARTITION BY video_id ORDER BY id ASC) - id < -15) AS INT), 0) AS is_not_same_session,
          FROM segments
          WHERE contains(lower(text), lower('${searchTerm.slice(1, -1)}'))
      ),
      
      sessions AS (
        SELECT
          video_id,
          id,
          start,
          "end",
          SUM(is_not_same_session) OVER (PARTITION BY video_id ORDER BY id ASC) AS session_id
        FROM raw_events_${mode}
      ),
      
      sessions_details AS (
        SELECT
          video_id,
          {'session_id': session_id, 'start_id': MIN(id), 'end_id': MAX(id), 'start': MIN(start) - 5, 'end': MAX("end") + 5} AS session_detail
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
    setRunning(false);
    setSearchParams({...Object.fromEntries(searchParams.entries()), search: searchTerm});
  }

  const handleHighlightsCreation = (highlight) => {
    const previousValue = (highlight.video_id in highlights) ? highlights[highlight.video_id] : [];
    setHighlights({...highlights, [highlight.video_id]: [...previousValue, highlight]});
    window.localStorage.setItem("highlights", JSON.stringify({...highlights, [highlight.video_id]: [...previousValue, highlight]}));
  }

  return (
    <div className="App">
      <header>
        <h1>QRATORS<div className="borderLogo"></div></h1>
        <button className="noMargin"><a href="https://forms.gle/BuQbGvhcCVhL8CUg6" target="_blank" rel="noopener noreferrer">Stay updated</a></button>
      </header>
      <h2 className="subtitle">Playlist — Data Council <span onClick={() => setMode(ADMIN_MODE)}  style={{color: ADMIN_MODE === mode ? "red": "var(--main-color)"}}>2024</span></h2>
      <div className="content">
        <div className="left">
          {initialized && mode === SEARCH_MODE ?
            <div className="summary">
              Search for a term or watch highlights 🤭 (e.g. {['Airflow', 'dbt', 'dlt', '"SQL Glot"'].map((w, i) => <span><span className="link" onClick={() => setAndSearch(w)}>{w}</span>{i !== 3 ? ', ' : ''}</span>)}.)
              <p>You can search for exact terms by using double quotes (case insensitive) or use the full text search without quotes.</p>
              <p>Only works on Desktop yet, if you want it on mobile please reach out to us.</p>
            </div>
            : ""}
          {initialized ?
            <div className="search">
              <input
                type="text"
                value={input}
                placeholder={"Search for a concept"}
                disabled={running ? 'disabled' : ''}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {if (e.key === 'Enter') search()}}
              />
              <input
                type="button"
                disabled={running ? 'disabled' : ''}
                onClick={search}
                value="search"
              />
              <div>
                <span style={{marginRight: '10px'}}>
                  •
                </span>
                <input type="button" className="noMargin" disabled={running ? 'disabled' : ''} onClick={() => setMode(HIGHLIGHTS_MODE)} value="watch highlights"/>
              </div>
            </div>
            : ''}
          <div className="results">
            {initialized ? <div className="hint">{input === '' ? `${Object.entries(videos).length} videos` : <span>{queryResults.values.length} results {queryResults.values.length === 0 ? "(Don't forget to press Enter or click search)" : ''}</span>}</div> : ''}
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
            {((mode === ADMIN_MODE) || (initialized && videos && input === '') ) && Object.entries(videos).map(([videoId, video]) => (
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
        </div>
        <div className="right">
          <div className="summary">🤔 In this app you can search for concepts or watch highlights we handpicked in the 80 Data Council 2024 videos. Data Council highlights is an application designed and developed by <a href="https://blef.fr">blef</a> and <a href="https://juhache.substack.com">juhache</a>. This is not affiliated to the <a
            href="https://www.datacouncil.ai/">Data Council</a>.</div>
          {!initialized ? "App is initializing..." : ""}
          <div className="player" style={{display: `${selectedVideo ? 'block' : 'none'}`}}>
            {
              initialized && selectedVideo ?
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
