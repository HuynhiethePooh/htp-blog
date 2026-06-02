export default function StartScreen({ onStart }) {
  return (
    <div className="start-screen">
      <div className="start-content">
        <h1 className="logo">NYGuesser</h1>
        <p className="tagline">Can you guess where in NYC these restaurants are?</p>
        <ul className="rules">
          <li>5 rounds, each showing a real NYC restaurant photo</li>
          <li>Click the map to drop your pin</li>
          <li>Closer guess = more points (max 5,000 per round)</li>
        </ul>
        <button className="primary-btn" onClick={onStart}>
          Start Game
        </button>
      </div>
    </div>
  )
}
