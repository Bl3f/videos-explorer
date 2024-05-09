import React from "react";
import Highlight from "./Highlight";
import ReactPlayer from 'react-player/youtube';
import { FaPause, FaPlay } from "react-icons/fa";


const allHighlights = {
  cylAr9oUluI: [
    {start: 31, end: 47, text: "Awesome catchphrase regarding data culture."},
    {start: 89, end: 120, text: "Awesome catchphrase 2 regarding data culture."},
  ],
}

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
  const { video, segments } = props;

  const playerRef = React.useRef(null);
  const backgroundRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState({});
  const [playbackRate, setplaybackRate] = React.useState(1);
  const [duration, setDuration] = React.useState('00:00');
  const [dynamicTitle, setDynamicTitle] = React.useState('');

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
    setDynamicTitle(id);
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
          playing={playing}
          playbackRate={playbackRate}
          onProgress={setProgress}
          onDuration={setDuration}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>
      <div className="controls">
        <div className="timeline">
          <div ref={backgroundRef} className="background" onClick={handleSeek} onMouseMove={(e) => {console.log(e)}}></div>
          <div className="firstground" style={{width: `${progress.played * 100}%`}}></div>
          {segments ? toArray(segments.sessions).map((session, i) => {
            if (backgroundRef.current) {
              const width = backgroundRef.current.getBoundingClientRect().width;
              const start = session.start * width / duration;
              const end = session.end * width / duration;

              return (
                <div
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
        </div>
        <div className="buttons">
          <div onClick={() => setPlaying(!playing)}>{playing ? <FaPause className="video-control" /> : <FaPlay className="video-control" />}</div>
          <div className="duration">{fancyTimeFormat(progress.playedSeconds)} / {fancyTimeFormat(duration)}</div>
          <div className="dynamicTitle">{dynamicTitle ? `• Segment n°${dynamicTitle}` : ''}</div>
          <div className="playbackRate" onClick={() => setplaybackRate(Math.max(1, (playbackRate + .25) % 2.25))}>x{playbackRate}</div>
        </div>
      </div>
    </div>
  )
}

export default Player;