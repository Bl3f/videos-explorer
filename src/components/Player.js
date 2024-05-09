import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import YouTube from 'react-youtube';
import Highlight from "./Highlight";

const allHighlights = {
  cylAr9oUluI: [
    {start: 31, end: 47, text: "Awesome catchphrase regarding data culture."},
    {start: 89, end: 120, text: "Awesome catchphrase 2 regarding data culture."},
  ],
}

class Player extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      player: null,
      timecode: null,
      transcript: {segments: []},
      visible: {actual: null, previous: [], next: []},
    };
  }

  onPlay = (event) => {
    console.log('Playing video');
    this.interval = setInterval(() => {
      const timecode = event.target.getCurrentTime();
      this.setState({timecode});
      this.setVisibleSegments(timecode);
    }, 400)
  }

  onPause = () => {
    console.log('Pausing video');
    clearInterval(this.interval);
  }

  componentDidMount() {
    const {video} = this.props;
    fetch(`http://localhost:8000/${video.id}.json`)
      .then((response) => response.json())
      .then((data) => this.setState({transcript: data}));
  }

  componentWillUnmount() {
    console.log("will unmount");
  }

  setVisibleSegments = (timecode) => {
    const {transcript} = this.state;
    const offset = 2;
    const index = transcript.segments.findIndex((segment) => segment.start <= timecode && segment.end >= timecode);
    if (index === -1) {
      return this.state.visible;
    } else {
      this.setState({visible: {
        "actual": transcript.segments[index],
        "previous": transcript.segments.slice(index - offset, index).concat(new Array(offset).fill({text: "-"})).slice(0, offset),
        "next": index < transcript.segments.length - offset ? transcript.segments.slice(index + 1, index + offset + 1) : [],
      }});
    }
  }

  jumpTo = (segmentId) => () => {
    const {player, transcript} = this.state;
    const timecode = transcript.segments[segmentId].start;
    player.seekTo(timecode);
    player.playVideo();
  }

  render() {
    const {video} = this.props;
    const {
      actual,
      previous,
      next,
    } = this.state.visible;
    const highlights = allHighlights[video.id] || [];


    return (
      <div>
        <h2>{video.title}</h2>
        <YouTube
          videoId={video.id}
          opts={{}}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onEnd={this.onPause}
          onReady={(event) => this.setState({player: event.target})}
        />
        {
          highlights.map((highlight) => (<Highlight action={() => this.jumpTo(highlight.start)} description={highlight.text} />))
        }
        {
          actual ?
            <div className="transcript">
              <div className="previous">
                {previous.map((segment) => <div>{segment.text}</div>)}
              </div>
              <div className="actual">
                {actual.id} — {actual.text}
              </div>
              <div className="next">
                {next.map((segment) => <div>{segment.text}</div>)}
              </div>
            </div> : ""
        }
      </div>
    )
  }
}

export default Player;