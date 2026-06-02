import { useState } from 'react'
import { APIProvider } from '@vis.gl/react-google-maps'
import StartScreen from './components/StartScreen'
import GameScreen from './components/GameScreen'
import ResultScreen from './components/ResultScreen'
import FinalScreen from './components/FinalScreen'
import './nyguesser.css'

const TOTAL_ROUNDS = 5
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export default function NYGuesser() {
  const [gameState, setGameState] = useState('start')
  const [round, setRound] = useState(1)
  const [results, setResults] = useState([])
  const [currentResult, setCurrentResult] = useState(null)

  const startGame = () => {
    setRound(1)
    setResults([])
    setCurrentResult(null)
    setGameState('playing')
  }

  const handleGuessSubmit = (result) => {
    setCurrentResult(result)
    setGameState('result')
  }

  const handleNext = () => {
    const newResults = [...results, currentResult]
    setResults(newResults)
    setCurrentResult(null)
    if (round >= TOTAL_ROUNDS) {
      setGameState('finished')
    } else {
      setRound(r => r + 1)
      setGameState('playing')
    }
  }

  return (
    <APIProvider apiKey={API_KEY}>
      {gameState === 'start' && <StartScreen onStart={startGame} />}
      {gameState === 'playing' && (
        <GameScreen
          key={round}
          round={round}
          totalRounds={TOTAL_ROUNDS}
          onSubmit={handleGuessSubmit}
        />
      )}
      {gameState === 'result' && currentResult && (
        <ResultScreen
          result={currentResult}
          round={round}
          totalRounds={TOTAL_ROUNDS}
          onNext={handleNext}
        />
      )}
      {gameState === 'finished' && (
        <FinalScreen results={results} onPlayAgain={startGame} />
      )}
    </APIProvider>
  )
}
