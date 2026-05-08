import { useEffect, useState } from 'react'
import type { Level, QuizQuestion } from '../data/types'

interface QuizSectionProps {
  level: Level
  cleared: boolean
  onClear: () => void
  onCorrect?: () => void
  onWrong?: () => void
}

type AnswerState =
  | { kind: 'idle' }
  | { kind: 'correct' }
  | { kind: 'wrong'; pickedIndex: number }

/**
 * Per-level quiz gate. Visitors must answer every question correctly (in
 * order, with retries) to clear the level. Wrong answers shake gently and
 * reveal the hint; correct answers advance to the next question. The final
 * correct answer unlocks the level via `onClear`.
 */
export function QuizSection({ level, cleared, onClear, onCorrect, onWrong }: QuizSectionProps) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answer, setAnswer] = useState<AnswerState>({ kind: 'idle' })

  // Reset internal state when the level changes (or when reset to uncleared).
  useEffect(() => {
    setQuestionIndex(0)
    setAnswer({ kind: 'idle' })
  }, [level.id])

  if (level.quizzes.length === 0) {
    return null
  }

  if (cleared) {
    return (
      <section className="quiz quiz--cleared" aria-live="polite">
        <h3 className="chapter__heading">
          <span className="chapter__year">★</span>
          World {level.number} cleared
        </h3>
        <p className="quiz__cleared-msg">
          Save updated. Onward to the next world.
        </p>
      </section>
    )
  }

  const total = level.quizzes.length
  const q = level.quizzes[questionIndex]

  const handlePick = (i: number) => {
    if (answer.kind === 'correct') return
    if (i === q.correctIndex) {
      setAnswer({ kind: 'correct' })
      onCorrect?.()
      // After a beat, advance to the next question or clear the level.
      window.setTimeout(() => {
        if (questionIndex + 1 >= total) {
          onClear()
        } else {
          setQuestionIndex(questionIndex + 1)
          setAnswer({ kind: 'idle' })
        }
      }, 900)
    } else {
      setAnswer({ kind: 'wrong', pickedIndex: i })
      onWrong?.()
    }
  }

  return (
    <section className="quiz" aria-label="Level quiz">
      <h3 className="chapter__heading">
        <span className="chapter__year">?</span>
        Quiz · Q{questionIndex + 1} of {total}
      </h3>

      <p className="quiz__question">{q.question}</p>

      <div className="quiz__options">
        {q.options.map((opt, i) => {
          const isPickedWrong =
            answer.kind === 'wrong' && answer.pickedIndex === i
          const isCorrect =
            answer.kind === 'correct' && i === q.correctIndex
          return (
            <button
              key={i}
              type="button"
              className={`quiz__option pixel-btn ${
                isPickedWrong ? 'is-wrong' : ''
              } ${isCorrect ? 'is-correct' : ''}`}
              onClick={() => handlePick(i)}
              disabled={answer.kind === 'correct'}
            >
              <span className="quiz__option-letter">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="quiz__option-text">{opt}</span>
            </button>
          )
        })}
      </div>

      {answer.kind === 'wrong' && (
        <Feedback kind="wrong" question={q} />
      )}
      {answer.kind === 'correct' && (
        <Feedback kind="correct" question={q} />
      )}
    </section>
  )
}

function Feedback({
  kind,
  question,
}: {
  kind: 'wrong' | 'correct'
  question: QuizQuestion
}) {
  if (kind === 'wrong') {
    return (
      <p className="quiz__feedback quiz__feedback--wrong">
        ✗ That's a no. Try again.
        {question.hint && <span className="quiz__hint">Hint: {question.hint}</span>}
      </p>
    )
  }
  return (
    <p className="quiz__feedback quiz__feedback--correct">
      {question.feedback ?? '⭐ Correct!'}
    </p>
  )
}
