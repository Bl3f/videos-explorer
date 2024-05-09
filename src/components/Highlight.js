function Highlight(props) {
  const {
    action,
    description,
    active,
  } = props;

  return (
    <div className={active ? "transcript active": "transcript"} onClick={action()}>
      {description}
    </div>
  );
}

export default Highlight;