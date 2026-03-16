import { useState, useEffect, useMemo } from 'react'
import api from '../api'

const QUOTES = {
  technique: [
    { text: "There's nothing remarkable about it: all one has to do is hit the right keys at the right time, and the instrument plays itself.", author: "J.S. Bach" },
    { text: "Don't play it until you get it right. Play it until you can't get it wrong.", author: null },
    { text: "If you sound great in the practice room, you're practicing the wrong thing.", author: null },
    { text: "There is no such thing as a difficult piece. A piece is either impossible, or it is easy. The process whereby it migrates from one category to the other is known as practicing.", author: "Louis Kentner" },
  ],
  tempo: [
    { text: "If you can play it slow, you can play it fast.", author: null },
    { text: "The most valuable practice aid is patience.", author: null },
    { text: "Slow down, and everything you are chasing will come around and catch you.", author: "John De Paola" },
  ],
  rhythm: [
    { text: "People don't understand that it's so much more than hitting things. The drums are the backbone.", author: "Questlove" },
    { text: "Rhythm is something you either have or you don't have, but when you have it, you have it all over.", author: "Elvis Presley" },
    { text: "We vibrate. Our hearts are pumping blood. We are a rhythm machine, that's what we are.", author: "Mickey Hart" },
    { text: "If you play a tune, and a person don't tap their feet, don't play the tune.", author: "Count Basie" },
  ],
  tone: [
    { text: "How you play a note is just as important as what the note is.", author: "Henry Kaiser" },
    { text: "Try practicing for beauty as well as practicing for technique.", author: "Josef Lhévinne" },
    { text: "Some days you get up, and you put the horn to your chops, and it sounds pretty good, and you win. Some days, you try, and nothing works, and the horn wins.", author: "Dizzy Gillespie" },
  ],
  memorization: [
    { text: "Don't just memorize notes; memorize the feeling of playing them.", author: null },
    { text: "The memory of things gone is important to a jazz musician.", author: "Louis Armstrong" },
    { text: "You want to play something that you can't? You need to see and hear yourself doing it in your mind's eye. It will start to happen.", author: "Steve Vai" },
  ],
  transcription: [
    { text: "I stole everything I ever heard, but mostly I stole from the horns.", author: "Ella Fitzgerald" },
    { text: "When you listen to music, it's not a passive act. You're fully engaged in the experience, almost swimming around in it.", author: "Jonathan Harnum" },
    { text: "The most important thing I look for in a musician is whether he knows how to listen.", author: "Duke Ellington" },
  ],
  improvisation: [
    { text: "Learn the changes, then forget them.", author: "Charlie Parker" },
    { text: "If you find a note tonight that sounds good, play the same damn note every night!", author: "Count Basie" },
    { text: "Do not fear mistakes. There are none.", author: "Miles Davis" },
    { text: "If you hit a wrong note, then make it right by what you play afterwards.", author: "Joe Pass" },
  ],
}

function pickQuote(focus) {
  let pool
  if (focus && QUOTES[focus]) {
    pool = QUOTES[focus]
  } else {
    // Flatten all focus quotes into one pool
    pool = Object.values(QUOTES).flat()
  }
  const now = new Date()
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24))
  return pool[dayOfYear % pool.length]
}

function PracticeProfile() {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    api.get('/practice-profile').then(res => setProfile(res.data)).catch(() => {})
  }, [])

  const quote = useMemo(() => {
    return pickQuote(profile?.dominant_focus)
  }, [profile])

  if (!quote) return null

  return (
    <div className="practice-profile">
      <blockquote className="practice-quote">
        <p className="practice-quote-text">"{quote.text}"</p>
        {quote.author && (
          <footer className="practice-quote-author">— {quote.author}</footer>
        )}
      </blockquote>
    </div>
  )
}

export default PracticeProfile