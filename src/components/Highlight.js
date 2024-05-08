function Highlight(props) {
  const {
    action,
    description,
  } = props;

  return (
    <div onClick={action()}>
      {description}
    </div>
  );
}

export default Highlight;