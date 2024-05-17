import React, {useEffect} from "react";
import ReactPlayer from 'react-player/youtube';
import { FaPause, FaPlay } from "react-icons/fa";
import {ADMIN_MODE, HIGHLIGHTS_OFFSET} from "../consts";

function fancyTimeFormat(duration) {
  // Hours, minutes and seconds
  const hrs = ~~(duration / 3600);
  const mins = ~~((duration % 3600) / 60);
  const secs = ~~duration % 60;

  // Output like "1:01" or "4:03:59" or "123:03:59"
  let ret = "";

  if (hrs > 0) {
    ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
  }

  ret += "" + mins + ":" + (secs < 10 ? "0" : "");
  ret += "" + secs;

  return ret;
}

function Player(props) {
  const { video, segments, mode, setHighlights, highlights, prout=null } = props;
  console.log(segments);
  const savedPlayerConfig = window.localStorage.getItem("playerConfig") ? JSON.parse(window.localStorage.getItem("playerConfig")) : {"volume": 0.8, "playbackRate": 1};

  const [transcript, setTranscript] = React.useState({segments: []});
  const [currentSegment, setCurrentSegment] = React.useState({});
  const [currentHightlightCreation, setCurrentHightlightCreation] = React.useState({start: null, end: null, description: null, video_id: video.id});

  const playerRef = React.useRef(null);
  const backgroundRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [volume, setVolume] = React.useState(savedPlayerConfig.volume);
  const [progress, setProgress] = React.useState({});
  const [playbackRate, setplaybackRate] = React.useState(savedPlayerConfig.playbackRate);
  const [duration, setDuration] = React.useState('00:00');
  const [dynamicTitle, setDynamicTitle] = React.useState('');

  //const currentSegment = transcript.segments && progress.playedSeconds ? transcript.segments.filter((segment) => segment.start <= progress.playedSeconds && segment.end > progress.playedSeconds)[0] : {};

  useEffect(() => {
    if (prout) {
      return;
    } else {
      fetch(`https://storage.googleapis.com/videos-explorer/${video.id}.json`)
        .then((response) => response.json())
        .then((data) => setTranscript(data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findCurrentSegment = (progress) => {
    if (!transcript.segments) {
      return null;
    }
    const segments = transcript.segments.filter((segment) => segment.start <= progress.playedSeconds && segment.end > progress.playedSeconds);
    return segments.length > 0 ? setCurrentSegment(segments[0]) : null;
  }

  const handleSeek = (e) => {
    const target = e.target;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const seconds = duration * percentage;
    playerRef.current.seekTo(seconds);
    setPlaying(true);
  }

  const toArray = (arrowObj) => {
    if (arrowObj === undefined) return [];
    const sessions = arrowObj;
    const size = sessions.length;
    const items = []
    for (let i = 0; i < size; i++) {
      items.push(Object.fromEntries((new Map(sessions.get(i)))));
    }
    return items;
  }

  const handleSegmentHover = (e, id) => {
    setDynamicTitle(`Segment n°${id}`);
  }

  const handleCreateHighlight = (e, id) => {
    if (currentHightlightCreation.start === null) {
      setCurrentHightlightCreation({...currentHightlightCreation, start: id});
    } else {
      setCurrentHightlightCreation({...currentHightlightCreation, end: id});
    }
  }

  return (
    <div>
      <h2>{video.title}</h2>
      <div className="player-wrapper">
        <ReactPlayer
          ref={playerRef}
          className='react-player'
          url={`https://www.youtube.com/watch?v=${video.id}`}
          width='100%'
          height='100%'
          playing={playing}
          volume={volume}
          playbackRate={playbackRate}
          onProgress={(value) => {setProgress(value); findCurrentSegment(value)}}
          onDuration={setDuration}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>
      <div className="controls">
        <div className="timeline">
          <div ref={backgroundRef} className="background" onClick={handleSeek} onMouseMove={(e) => {}}></div>
          <div className="firstground" style={{width: `${progress.played * 100}%`}}></div>
          {segments ? toArray(segments.sessions).map((session, i) => {
            console.log(session);
            if (backgroundRef.current) {
              const width = backgroundRef.current.getBoundingClientRect().width;
              console.log(width)
              const start = session.start * width / duration;
              const end = session.end * width / duration;

              return (
                <div
                  key={`segment-${i}`}
                  className="segments"
                  onMouseMove={(e) => handleSegmentHover(e, session.session_id)}
                  onMouseLeave={() => setDynamicTitle('')}
                  onClick={() => {playerRef.current.seekTo(session.start); setPlaying(true);}}
                  style={{left: `${start}px`, width: `${end - start}px`, }}
                ></div>
              );
            } else {
              return ''
            }
          }) : ''}
          {
            highlights ? highlights.map((highlight, i) => {
              if (backgroundRef.current && transcript.segments.length > 0) {
                const width = backgroundRef.current.getBoundingClientRect().width;
                const start = transcript.segments[highlight.start].start * width / duration;
                const end = transcript.segments[highlight.end].end * width / duration;

                return (
                  <div
                    key={`highlight-${i}`}
                    className="segments highlight"
                    onMouseMove={() => setDynamicTitle(highlight.description)}
                    onMouseLeave={() => setDynamicTitle('')}
                    onClick={() => {playerRef.current.seekTo(transcript.segments[highlight.start].start); setPlaying(true);}}
                    style={{left: `${start}px`, width: `${end - start}px`, }}
                  ></div>
                )
              } else {
                return '';
              }
          }) : ''}
        </div>
        <div className="buttons">
          <div onClick={() => setPlaying(!playing)}>{playing ? <FaPause className="video-control" /> : <FaPlay className="video-control" />}</div>
          <div className="duration">{fancyTimeFormat(progress.playedSeconds)} / {fancyTimeFormat(duration)}</div>
          <div className="volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={event => {
                setVolume(event.target.valueAsNumber); window.localStorage.setItem("playerConfig", JSON.stringify({...savedPlayerConfig, volume: event.target.valueAsNumber}));
              }}
            />
          </div>
          <div className="dynamicTitle">{dynamicTitle ? `• ${dynamicTitle}` : ''}</div>
          <div
            className="playbackRate"
            onClick={() => {
              const value = Math.max(1, (playbackRate + .25) % 2.25);
              setplaybackRate(value);
              window.localStorage.setItem("playerConfig", JSON.stringify({...savedPlayerConfig, playbackRate: value}));
            }}
          >
            x{playbackRate}
          </div>
        </div>
        {mode === ADMIN_MODE && <div className="admin">
        <h3>Create a highlight</h3>
          {
            currentSegment && transcript.segments &&
            transcript.segments.slice(
              Math.max(Math.min(currentSegment.id - HIGHLIGHTS_OFFSET, (currentHightlightCreation.start ? currentHightlightCreation.start : Infinity)), 0),
              currentSegment.id + HIGHLIGHTS_OFFSET
            ).map((segment, i) => (
              <div
                key={`transcript-${video.id}-${i}`}
                className={currentSegment.id === segment.id ? "transcript active" : "transcript"}
              >
                <input
                  type="checkbox"
                  onChange={(e) => handleCreateHighlight(e, segment.id)}
                  checked={(currentHightlightCreation.start === segment.id) || (currentHightlightCreation.end === segment.id)}
                />{segment.text}
              </div>
            ))
          }
          <pre>
            {JSON.stringify(currentHightlightCreation, null, 2)}
          </pre>
          <div>
            <div>
              <textarea
                value={currentHightlightCreation.description}
                onChange={(e) => setCurrentHightlightCreation({...currentHightlightCreation, description: e.target.value})}
              />
            </div>
            <input type="button" value="reset" onClick={() => setCurrentHightlightCreation({start: null, end: null, description: null, video_id: video.id})}/>
            <input type="button" value="create highlight" onClick={() => setHighlights(currentHightlightCreation)} />
          </div>
        </div>}
      </div>
    </div>
  )
}

export default Player;