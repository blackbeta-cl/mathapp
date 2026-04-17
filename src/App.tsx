import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type GameId = 'input' | 'choice' | 'voice'

type GameConfig = {
  id: GameId
  badge: string
  title: string
  description: string
  accent: string
  actionLabel: string
  helperText: string
}

type Question = {
  id: string
  factorA: number
  factorB: number
  prompt: string
  answer: number
  choices: number[]
}

type AnswerRecord = {
  prompt: string
  factorA: number
  factorB: number
  expected: number
  userAnswer: string
  correct: boolean
  gameId: GameId
}

type SessionState = {
  gameId: GameId
  startedAt: number
  questions: Question[]
  currentIndex: number
  answers: AnswerRecord[]
}

type SessionRecord = {
  id: string
  studentName: string
  playedAt: string
  gameId: GameId
  gameName: string
  score: number
  total: number
  accuracy: number
  durationSeconds: number
  rating: string
  encouragement: string
  answers: AnswerRecord[]
}

type FeedbackState = {
  correct: boolean
  message: string
}

type HistoryInsight = {
  totalSessions: number
  averageAccuracy: number
  bestScore: number
  favoriteGame: string
  focusTables: number[]
}

type PracticeSettings = {
  prioritizeSelectedTables: boolean
  prioritizedTables: number[]
  questionCount: number
}

type SpeechRecognitionAlternativeLike = {
  transcript: string
  confidence: number
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionResultListLike = {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionEventLike = Event & {
  results: SpeechRecognitionResultListLike
}

type SpeechRecognitionErrorEventLike = Event & {
  error?: string
}

type SpeechRecognitionLike = EventTarget & {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

declare global {
  interface Document {
    webkitExitFullscreen?: () => Promise<void> | void
    webkitFullscreenElement?: Element | null
    webkitFullscreenEnabled?: boolean
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const STORAGE_KEY = 'mathapp-multiplication-history-v1'
const SETTINGS_STORAGE_KEY = 'mathapp-multiplication-settings-v1'
const STUDENT_NAME_STORAGE_KEY = 'mathapp-student-name-v1'
const DEFAULT_QUESTION_COUNT = 6
const MAX_TABLE = 10
const MAX_QUESTION_COUNT = MAX_TABLE * MAX_TABLE
const TABLE_OPTIONS = Array.from({ length: MAX_TABLE }, (_, index) => index + 1)

const GAME_CONFIGS: Record<GameId, GameConfig> = {
  input: {
    id: 'input',
    badge: 'Escribe',
    title: 'Cohete de resultados',
    description: 'Mira la multiplicacion, escribe la respuesta y despega hacia la siguiente mision.',
    accent: '#7c3aed',
    actionLabel: 'Jugar ahora',
    helperText: 'Ideal para practicar calma, foco y calculo mental.',
  },
  choice: {
    id: 'choice',
    badge: 'Elige',
    title: 'Selva de opciones',
    description: 'Aparecen cuatro resultados posibles. Elige el correcto antes de que escape el mono matematico.',
    accent: '#f97316',
    actionLabel: 'Entrar a la selva',
    helperText: 'Perfecto para rapidez visual y reconocimiento de resultados.',
  },
  voice: {
    id: 'voice',
    badge: 'Habla',
    title: 'Eco matematico',
    description: 'Di la respuesta en voz alta. La app escucha numeros en espanol y sigue con el siguiente reto.',
    accent: '#06b6d4',
    actionLabel: 'Hablar y responder',
    helperText: 'Excelente para memorizar tablas con ritmo y confianza.',
  },
}

const FUTURE_GAMES = [
  'Memoria de factores: emparejar multiplicaciones con resultados.',
  'Carrera contra reloj: responder la mayor cantidad de tablas en 60 segundos.',
  'Bingo de tablas: completar cartones con productos correctos.',
  'Jefe final por tabla: dominar una tabla completa antes de desbloquear la siguiente.',
]

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffleArray<T>(items: T[]) {
  const cloned = [...items]

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]]
  }

  return cloned
}

function buildChoices(answer: number) {
  const options = new Set<number>([answer])

  while (options.size < 4) {
    const candidate = Math.max(0, answer + randomInt(-12, 12))

    if (candidate !== answer) {
      options.add(candidate)
    }
  }

  return shuffleArray([...options])
}

function normalizeQuestionCount(questionCount: number) {
  return Math.min(MAX_QUESTION_COUNT, Math.max(1, Math.round(questionCount)))
}

function buildQuestion(factorA: number, factorB: number): Question {
  const answer = factorA * factorB

  return {
    id: crypto.randomUUID(),
    factorA,
    factorB,
    prompt: `${factorA} x ${factorB}`,
    answer,
    choices: buildChoices(answer),
  }
}

function createQuestionPool(settings: PracticeSettings) {
  const prioritizedTables = [...new Set(settings.prioritizedTables)].sort((left, right) => left - right)
  const questions: Question[] = []

  if (settings.prioritizeSelectedTables && prioritizedTables.length > 0) {
    prioritizedTables.forEach((table) => {
      TABLE_OPTIONS.forEach((multiplier) => {
        questions.push(buildQuestion(table, multiplier))
      })
    })

    return questions
  }

  TABLE_OPTIONS.forEach((factorA) => {
    TABLE_OPTIONS.forEach((factorB) => {
      questions.push(buildQuestion(factorA, factorB))
    })
  })

  return questions
}

function getEffectiveQuestionCount(settings: PracticeSettings) {
  return Math.min(normalizeQuestionCount(settings.questionCount), createQuestionPool(settings).length)
}

function createSession(gameId: GameId, settings: PracticeSettings): SessionState {
  const shuffledPool = shuffleArray(createQuestionPool(settings))
  const questionCount = Math.min(normalizeQuestionCount(settings.questionCount), shuffledPool.length)

  return {
    gameId,
    startedAt: Date.now(),
    currentIndex: 0,
    answers: [],
    questions: shuffledPool.slice(0, questionCount),
  }
}

function getRating(score: number, total: number) {
  if (score === total) {
    return {
      label: 'Super estrella',
      encouragement: 'Excelente trabajo. Ya estas dominando las tablas como un campeon.',
    }
  }

  if (score >= total - 1) {
    return {
      label: 'Casi perfecto',
      encouragement: 'Muy bien. Falto muy poquito para una ronda perfecta.',
    }
  }

  if (score >= Math.ceil(total / 2)) {
    return {
      label: 'Buen entrenamiento',
      encouragement: 'Vas super bien. Sigue practicando y cada vez saldra mas rapido.',
    }
  }

  return {
    label: 'Valiente explorador',
    encouragement: 'Lo importante es seguir intentando. Cada partida te hace mas fuerte.',
  }
}

function formatDuration(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds}s`
  }

  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60
  return `${minutes}m ${seconds}s`
}

function loadHistory() {
  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return [] as SessionRecord[]
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<SessionRecord>>

    if (!Array.isArray(parsed)) {
      return [] as SessionRecord[]
    }

    return parsed.flatMap((record) => {
      if (
        typeof record.id !== 'string' ||
        typeof record.playedAt !== 'string' ||
        typeof record.gameId !== 'string' ||
        typeof record.gameName !== 'string' ||
        typeof record.score !== 'number' ||
        typeof record.total !== 'number' ||
        typeof record.accuracy !== 'number' ||
        typeof record.durationSeconds !== 'number' ||
        typeof record.rating !== 'string' ||
        typeof record.encouragement !== 'string' ||
        !Array.isArray(record.answers)
      ) {
        return []
      }

      return [
        {
          id: record.id,
          studentName: typeof record.studentName === 'string' ? record.studentName : '',
          playedAt: record.playedAt,
          gameId: record.gameId as GameId,
          gameName: record.gameName,
          score: record.score,
          total: record.total,
          accuracy: record.accuracy,
          durationSeconds: record.durationSeconds,
          rating: record.rating,
          encouragement: record.encouragement,
          answers: record.answers as AnswerRecord[],
        },
      ]
    })
  } catch {
    return []
  }
}

function saveHistory(records: SessionRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function loadStudentName() {
  const raw = window.localStorage.getItem(STUDENT_NAME_STORAGE_KEY)
  return typeof raw === 'string' ? raw.trim() : ''
}

function normalizeStudentName(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function getStudentKey(name: string) {
  return normalizeStudentName(name).toLowerCase()
}

function getFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null
}

function isFullscreenAvailable() {
  return Boolean(
    document.fullscreenEnabled ??
      document.webkitFullscreenEnabled ??
      document.documentElement.requestFullscreen ??
      (document.documentElement as FullscreenCapableElement).webkitRequestFullscreen,
  )
}

function loadPracticeSettings(): PracticeSettings {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

  if (!raw) {
    return {
      prioritizeSelectedTables: false,
      prioritizedTables: [],
      questionCount: DEFAULT_QUESTION_COUNT,
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PracticeSettings>
    const prioritizedTables = Array.isArray(parsed.prioritizedTables)
      ? parsed.prioritizedTables.filter(
          (table): table is number =>
            typeof table === 'number' && Number.isInteger(table) && table >= 1 && table <= MAX_TABLE,
        )
      : []

    return {
      prioritizeSelectedTables: Boolean(parsed.prioritizeSelectedTables),
      prioritizedTables,
      questionCount:
        typeof parsed.questionCount === 'number'
          ? normalizeQuestionCount(parsed.questionCount)
          : DEFAULT_QUESTION_COUNT,
    }
  } catch {
    return {
      prioritizeSelectedTables: false,
      prioritizedTables: [],
      questionCount: DEFAULT_QUESTION_COUNT,
    }
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSpokenNumber(rawValue: string) {
  const digits = rawValue.match(/\d+/)

  if (digits) {
    return Number(digits[0])
  }

  const normalized = normalizeText(rawValue)

  const units: Record<string, number> = {
    cero: 0,
    uno: 1,
    un: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
  }

  const direct: Record<string, number> = {
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    diecisiete: 17,
    dieciocho: 18,
    diecinueve: 19,
    veinte: 20,
    veintiuno: 21,
    veintidos: 22,
    veintitres: 23,
    veinticuatro: 24,
    veinticinco: 25,
    veintiseis: 26,
    veintisiete: 27,
    veintiocho: 28,
    veintinueve: 29,
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    sesenta: 60,
    setenta: 70,
    ochenta: 80,
    noventa: 90,
    cien: 100,
  }

  if (normalized in units) {
    return units[normalized]
  }

  if (normalized in direct) {
    return direct[normalized]
  }

  if (normalized.startsWith('veinti')) {
    const unit = normalized.slice('veinti'.length)
    return unit in units ? 20 + units[unit] : null
  }

  const tens: Record<string, number> = {
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    sesenta: 60,
    setenta: 70,
    ochenta: 80,
    noventa: 90,
  }

  const parts = normalized.split(' y ')

  if (parts.length === 2 && parts[0] in tens && parts[1] in units) {
    return tens[parts[0]] + units[parts[1]]
  }

  return null
}

function getHistoryInsight(history: SessionRecord[]): HistoryInsight | null {
  if (history.length === 0) {
    return null
  }

  const answeredQuestions = history.reduce((sum, session) => sum + session.total, 0)
  const correctAnswers = history.reduce((sum, session) => sum + session.score, 0)
  const bestScore = history.reduce((best, session) => Math.max(best, session.score), 0)

  const gameCounter = history.reduce<Record<string, number>>((accumulator, session) => {
    accumulator[session.gameName] = (accumulator[session.gameName] ?? 0) + 1
    return accumulator
  }, {})

  const favoriteGame =
    Object.entries(gameCounter).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Cohete de resultados'

  const tableErrors = new Map<number, number>()

  history.forEach((session) => {
    session.answers
      .filter((answer) => !answer.correct)
      .forEach((answer) => {
        tableErrors.set(answer.factorA, (tableErrors.get(answer.factorA) ?? 0) + 1)
        tableErrors.set(answer.factorB, (tableErrors.get(answer.factorB) ?? 0) + 1)
      })
  })

  const focusTables = [...tableErrors.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([table]) => table)

  return {
    totalSessions: history.length,
    averageAccuracy: Math.round((correctAnswers / answeredQuestions) * 100),
    bestScore,
    favoriteGame,
    focusTables,
  }
}

function useSoundEffects() {
  const contextRef = useRef<AudioContext | null>(null)

  const getContext = useCallback(() => {
    if (!contextRef.current) {
      contextRef.current = new window.AudioContext()
    }

    if (contextRef.current.state === 'suspended') {
      void contextRef.current.resume()
    }

    return contextRef.current
  }, [])

  const playSequence = useCallback(
    (tones: Array<{ frequency: number; duration: number; volume: number }>) => {
      const context = getContext()
      let startAt = context.currentTime

      tones.forEach((tone) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()

        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(tone.frequency, startAt)
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(tone.volume, startAt + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration)

        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(startAt)
        oscillator.stop(startAt + tone.duration)

        startAt += tone.duration * 0.85
      })
    },
    [getContext],
  )

  return useMemo(
    () => ({
      playTap: () => playSequence([{ frequency: 420, duration: 0.08, volume: 0.04 }]),
      playCorrect: () =>
        playSequence([
          { frequency: 440, duration: 0.12, volume: 0.05 },
          { frequency: 554, duration: 0.12, volume: 0.05 },
          { frequency: 659, duration: 0.18, volume: 0.06 },
        ]),
      playWrong: () =>
        playSequence([
          { frequency: 260, duration: 0.12, volume: 0.04 },
          { frequency: 210, duration: 0.18, volume: 0.05 },
        ]),
      playWin: () =>
        playSequence([
          { frequency: 523, duration: 0.1, volume: 0.05 },
          { frequency: 659, duration: 0.1, volume: 0.05 },
          { frequency: 784, duration: 0.14, volume: 0.06 },
          { frequency: 988, duration: 0.2, volume: 0.06 },
        ]),
    }),
    [playSequence],
  )
}

function App() {
  const [history, setHistory] = useState<SessionRecord[]>(() => loadHistory())
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings>(() => loadPracticeSettings())
  const [studentName, setStudentName] = useState(() => loadStudentName())
  const [studentNameInput, setStudentNameInput] = useState(() => loadStudentName())
  const [isEditingStudentName, setIsEditingStudentName] = useState(() => loadStudentName() === '')
  const [session, setSession] = useState<SessionState | null>(null)
  const [latestResult, setLatestResult] = useState<SessionRecord | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(getFullscreenElement()))
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [studentNameError, setStudentNameError] = useState<string | null>(null)
  const [timerTick, setTimerTick] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null)
  const sounds = useSoundEffects()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const nextQuestionTimeoutRef = useRef<number | null>(null)
  const studentKey = useMemo(() => getStudentKey(studentName), [studentName])

  const studentHistory = useMemo(
    () => history.filter((record) => getStudentKey(record.studentName) === studentKey),
    [history, studentKey],
  )
  const historyInsight = useMemo(() => getHistoryInsight(studentHistory), [studentHistory])
  const availableQuestionCount = useMemo(() => createQuestionPool(practiceSettings).length, [practiceSettings])
  const effectiveQuestionCount = useMemo(
    () => getEffectiveQuestionCount(practiceSettings),
    [practiceSettings],
  )
  const currentQuestion = session?.questions[session.currentIndex] ?? null
  const currentGame = session ? GAME_CONFIGS[session.gameId] : null
  const speechRecognitionSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const fullscreenSupported = isFullscreenAvailable()
  const sessionStartedAt = session?.startedAt ?? null
  const elapsedSeconds = session ? timerTick : 0

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(practiceSettings))
  }, [practiceSettings])

  useEffect(() => {
    if (!studentName) {
      window.localStorage.removeItem(STUDENT_NAME_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(STUDENT_NAME_STORAGE_KEY, studentName)
  }, [studentName])

  useEffect(() => {
    if (!sessionStartedAt) {
      return
    }

    const intervalId = window.setInterval(() => {
      setTimerTick((currentTick) => currentTick + 1)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [sessionStartedAt])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(getFullscreenElement()))
      setFullscreenError(null)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (nextQuestionTimeoutRef.current) {
        window.clearTimeout(nextQuestionTimeoutRef.current)
      }

      recognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (!latestResult) {
      return
    }

    if (latestResult.score >= latestResult.total - 1) {
      void confetti({
        particleCount: latestResult.score === latestResult.total ? 180 : 120,
        spread: 90,
        origin: { y: 0.55 },
      })
      sounds.playWin()
    }
  }, [latestResult, sounds])

  const finishSession = (finishedSession: SessionState, answers: AnswerRecord[]) => {
    const score = answers.filter((answer) => answer.correct).length
    const durationSeconds = Math.max(1, Math.round((Date.now() - finishedSession.startedAt) / 1000))
    const rating = getRating(score, finishedSession.questions.length)
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      studentName,
      playedAt: new Date().toISOString(),
      gameId: finishedSession.gameId,
      gameName: GAME_CONFIGS[finishedSession.gameId].title,
      score,
      total: finishedSession.questions.length,
      accuracy: Math.round((score / finishedSession.questions.length) * 100),
      durationSeconds,
      rating: rating.label,
      encouragement: rating.encouragement,
      answers,
    }

    setHistory((currentHistory) => {
      const nextHistory = [record, ...currentHistory].slice(0, 40)
      saveHistory(nextHistory)
      return nextHistory
    })
    setLatestResult(record)
    setSession(null)
    setInputValue('')
    setFeedback(null)
    setIsTransitioning(false)
    setIsListening(false)
    setTimerTick(0)
    setVoiceMessage(null)
  }

  const queueNextStep = (updatedSession: SessionState, answers: AnswerRecord[], delay = 900) => {
    setIsTransitioning(true)

    nextQuestionTimeoutRef.current = window.setTimeout(() => {
      const nextIndex = updatedSession.currentIndex + 1

      if (nextIndex >= updatedSession.questions.length) {
        finishSession(updatedSession, answers)
        return
      }

      setSession({
        ...updatedSession,
        currentIndex: nextIndex,
        answers,
      })
      setInputValue('')
      setFeedback(null)
      setIsTransitioning(false)
      setIsListening(false)
      setVoiceMessage(null)
    }, delay)
  }

  const submitAnswer = (userAnswer: string) => {
    if (!session || !currentQuestion || isTransitioning) {
      return
    }

    const trimmedAnswer = userAnswer.trim()

    if (!trimmedAnswer) {
      return
    }

    const numericAnswer = Number(trimmedAnswer)
    const correct = numericAnswer === currentQuestion.answer
    const answerRecord: AnswerRecord = {
      prompt: currentQuestion.prompt,
      factorA: currentQuestion.factorA,
      factorB: currentQuestion.factorB,
      expected: currentQuestion.answer,
      userAnswer: trimmedAnswer,
      correct,
      gameId: session.gameId,
    }

    const answers = [...session.answers, answerRecord]

    setFeedback({
      correct,
      message: correct
        ? 'Muy bien. La siguiente viene en camino.'
        : `Casi. La respuesta correcta era ${currentQuestion.answer}.`,
    })

    if (session.gameId === 'voice') {
      setVoiceMessage(
        correct
          ? `Muy bien. Dijiste ${trimmedAnswer} y era correcto.`
          : `Escuche ${trimmedAnswer}, pero la respuesta correcta es ${currentQuestion.answer}.`,
      )
    }

    if (correct) {
      sounds.playCorrect()
    } else {
      sounds.playWrong()
    }

    queueNextStep(session, answers, session.gameId === 'voice' && !correct ? 1800 : 900)
  }

  const startGame = (gameId: GameId) => {
    if (!studentName) {
      setStudentNameError('Ingresa el nombre del estudiante antes de comenzar.')
      return
    }

    recognitionRef.current?.stop()
    sounds.playTap()
    setLatestResult(null)
    setFeedback(null)
    setInputValue('')
    setIsTransitioning(false)
    setIsListening(false)
    setTimerTick(0)
    setVoiceMessage(null)
    setStudentNameError(null)
    setSession(createSession(gameId, practiceSettings))
  }

  const saveStudentName = () => {
    const normalizedName = normalizeStudentName(studentNameInput)

    if (!normalizedName) {
      setStudentNameError('Escribe el nombre del estudiante para guardar su progreso.')
      return
    }

    sounds.playTap()
    setStudentName(normalizedName)
    setStudentNameInput(normalizedName)
    setIsEditingStudentName(false)
    setStudentNameError(null)
    setLatestResult(null)
  }

  const editStudentName = () => {
    sounds.playTap()
    setStudentNameInput(studentName)
    setIsEditingStudentName(true)
    setStudentNameError(null)
  }

  const togglePriorityMode = () => {
    sounds.playTap()
    setPracticeSettings((currentSettings) => ({
      ...currentSettings,
      prioritizeSelectedTables: !currentSettings.prioritizeSelectedTables,
    }))
  }

  const togglePriorityTable = (table: number) => {
    sounds.playTap()
    setPracticeSettings((currentSettings) => {
      const alreadySelected = currentSettings.prioritizedTables.includes(table)

      return {
        ...currentSettings,
        prioritizedTables: alreadySelected
          ? currentSettings.prioritizedTables.filter((currentTable) => currentTable !== table)
          : [...currentSettings.prioritizedTables, table].sort((left, right) => left - right),
      }
    })
  }

  const updateQuestionCount = (value: string) => {
    const numericValue = Number(value)

    setPracticeSettings((currentSettings) => ({
      ...currentSettings,
      questionCount: Number.isFinite(numericValue)
        ? normalizeQuestionCount(numericValue)
        : DEFAULT_QUESTION_COUNT,
    }))
  }

  const startListening = () => {
    if (!session || session.gameId !== 'voice' || !currentQuestion || isTransitioning) {
      return
    }

    const SpeechRecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognitionApi) {
      setVoiceMessage('Tu navegador no permite reconocimiento de voz. Puedes cambiar a otro juego.')
      return
    }

    recognitionRef.current?.stop()

    const recognition = new SpeechRecognitionApi()
    recognition.lang = 'es-CL'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      const parsedNumber = parseSpokenNumber(transcript)

      setVoiceMessage(`Escuche: "${transcript}"`)
      setIsListening(false)

      if (parsedNumber === null) {
        setVoiceMessage(`Escuche: "${transcript}". Prueba diciendo solo el numero.`)
        return
      }

      submitAnswer(String(parsedNumber))
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      setVoiceMessage(`No pude escuchar bien (${event.error ?? 'sin detalle'}). Intenta otra vez.`)
    }
    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    setVoiceMessage('Te estoy escuchando...')
    setIsListening(true)
    recognition.start()
  }

  const resetToHome = () => {
    recognitionRef.current?.stop()
    setSession(null)
    setFeedback(null)
    setInputValue('')
    setIsTransitioning(false)
    setIsListening(false)
    setTimerTick(0)
    setVoiceMessage(null)
  }

  const toggleFullscreen = async () => {
    sounds.playTap()

    if (!fullscreenSupported) {
      setFullscreenError('Tu navegador no permite pantalla completa en esta app.')
      return
    }

    try {
      if (getFullscreenElement()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else {
          await document.webkitExitFullscreen?.()
        }
      } else {
        const rootElement = document.documentElement as FullscreenCapableElement

        if (rootElement.requestFullscreen) {
          await rootElement.requestFullscreen()
        } else {
          await rootElement.webkitRequestFullscreen?.()
        }
      }
    } catch (error) {
      console.error('No fue posible cambiar a pantalla completa.', error)
      setFullscreenError('No se pudo activar pantalla completa. Intenta otra vez.')
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <div className="hero-topbar">
            <p className="eyebrow">Math &gt; 3 basico &gt; Multiplicaciones</p>
            <button
              type="button"
              className="fullscreen-button"
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </button>
          </div>
          <h1>Tablas divertidas para aprender jugando</h1>
          {studentName && <p className="student-greeting">Hola, {studentName}! Listo para jugar y aprender.</p>}
          <p className="hero-description">
            Sesiones cortas de 6 preguntas, feedback positivo, historial de avances y juegos
            disenados para reforzar las tablas del 1 al 10.
          </p>

          {fullscreenError && <p className="fullscreen-note">{fullscreenError}</p>}

          <div className="hero-pills">
            <span>Tablas del 1 al 10</span>
            <span>6 preguntas por partida</span>
            <span>Historial con reportes</span>
            <span>Celebracion con sonido y confeti</span>
            {fullscreenSupported && <span>Modo pantalla completa disponible</span>}
            {studentName && <span>Estudiante: {studentName}</span>}
          </div>
        </div>

        <div className="mascot-card">
          <div className="mascot-face" aria-hidden="true">
            <span>+</span>
            <span>x</span>
            <span>=</span>
          </div>
          <p className="mascot-title">Mision del dia</p>
          <strong>Dominar las tablas con alegria y constancia.</strong>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel game-panel">
          <div className="section-heading">
            <div>
              <p className="section-label">Juegos del modulo</p>
              <h2>Elige como quieres practicar</h2>
            </div>
            <span className="session-badge">Sesion de {effectiveQuestionCount} ejercicios</span>
          </div>

          <section className="settings-card">
            <div className="settings-header">
              <div>
                <p className="section-label">Estudiante</p>
                <h3>Nombre para guardar avances</h3>
              </div>
            </div>

            <p className="settings-description">
              El nombre queda guardado en este dispositivo y cada resultado se registra con ese
              estudiante.
            </p>

            {studentName && !isEditingStudentName ? (
              <div className="student-card">
                <div>
                  <p className="section-label">Perfil activo</p>
                  <strong>{studentName}</strong>
                </div>
                <button type="button" className="edit-student-button" onClick={editStudentName} aria-label="Editar nombre del estudiante">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 20h4l10-10-4-4L4 16v4Zm13.7-11.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15 6l2.7 2.7Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="student-form">
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(event) => setStudentNameInput(event.target.value)}
                  placeholder="Ejemplo: Mateo"
                  aria-label="Nombre del estudiante"
                />
                <button type="button" onClick={saveStudentName}>
                  Guardar nombre
                </button>
              </div>
            )}

            <p className="settings-summary">
              {studentName
                ? `Perfil activo: ${studentName}. Sus resultados quedaran guardados en este navegador.`
                : 'Aun no hay un estudiante activo. Guarda un nombre antes de empezar a jugar.'}
            </p>

            {studentNameError && <p className="student-note">{studentNameError}</p>}
          </section>

          <section className="settings-card">
            <div className="settings-header">
              <div>
                <p className="section-label">Configuracion</p>
                <h3>Priorizar tablas especificas</h3>
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={practiceSettings.prioritizeSelectedTables}
                  onChange={togglePriorityMode}
                />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-label">
                  {practiceSettings.prioritizeSelectedTables ? 'Activado' : 'Desactivado'}
                </span>
              </label>
            </div>

            <p className="settings-description">
              Marca una o varias tablas para que aparezcan con mayor frecuencia en las proximas
              sesiones. Si el switch esta apagado, las preguntas usan todas las tablas por igual.
            </p>

            <div className="table-selector" role="group" aria-label="Seleccion de tablas prioritarias">
              {TABLE_OPTIONS.map((table) => {
                const isSelected = practiceSettings.prioritizedTables.includes(table)

                return (
                  <button
                    key={table}
                    type="button"
                    className={`table-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => togglePriorityTable(table)}
                    aria-pressed={isSelected}
                  >
                    Tabla del {table}
                  </button>
                )
              })}
            </div>

            <p className="settings-summary">
              {practiceSettings.prioritizeSelectedTables && practiceSettings.prioritizedTables.length > 0
                ? `Prioridad activa en: ${practiceSettings.prioritizedTables.map((table) => table.toString()).join(', ')}`
                : 'Sin prioridad activa. Las partidas mezclan todas las tablas del 1 al 10.'}
            </p>
          </section>

          <section className="settings-card">
            <div className="settings-header">
              <div>
                <p className="section-label">Duracion del juego</p>
                <h3>Cuantos ejercicios quieres por partida</h3>
              </div>
            </div>

            <p className="settings-description">
              El valor por defecto es {DEFAULT_QUESTION_COUNT}. La app evita repetir ejercicios en
              una misma sesion y ajusta el maximo segun las tablas disponibles.
            </p>

            <div className="question-count-form">
              <input
                type="number"
                min={1}
                max={availableQuestionCount}
                value={practiceSettings.questionCount}
                onChange={(event) => updateQuestionCount(event.target.value)}
                aria-label="Cantidad de ejercicios por juego"
              />
              <span className="question-count-pill">Disponibles: {availableQuestionCount}</span>
            </div>

            <p className="settings-summary">
              {practiceSettings.questionCount > effectiveQuestionCount
                ? `Configuraste ${practiceSettings.questionCount}, pero esta combinacion permite ${effectiveQuestionCount} ejercicios unicos.`
                : `Cada juego tendra ${effectiveQuestionCount} ejercicios unicos.`}
            </p>
          </section>

          {!session && !latestResult && (
            <div className="game-grid">
              {Object.values(GAME_CONFIGS).map((game) => (
                <motion.article
                  key={game.id}
                  className="game-card"
                  whileHover={{ y: -6 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  style={{ '--card-accent': game.accent } as React.CSSProperties}
                >
                  <span className="game-badge">{game.badge}</span>
                  <h3>{game.title}</h3>
                  <p>{game.description}</p>
                  <small>{game.helperText}</small>
                  <button type="button" onClick={() => startGame(game.id)} disabled={!studentName}>
                    {game.actionLabel}
                  </button>
                </motion.article>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {session && currentQuestion && currentGame ? (
              <motion.section
                key={`${session.gameId}-${session.currentIndex}`}
                className="play-area"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
              >
                <div className="play-header">
                  <div>
                    <p className="section-label">Jugando: {currentGame.title}</p>
                    <h2 className="play-question">{currentQuestion.prompt}</h2>
                  </div>
                  <button type="button" className="ghost-button" onClick={resetToHome}>
                    Volver
                  </button>
                </div>

                <div className="progress-row">
                  <div className="progress-track" aria-hidden="true">
                    <span
                      className="progress-fill"
                      style={{
                        width: `${((session.currentIndex + (feedback ? 1 : 0)) / session.questions.length) * 100}%`,
                        background: currentGame.accent,
                      }}
                    />
                  </div>
                  <strong>
                    Pregunta {session.currentIndex + 1} de {session.questions.length}
                  </strong>
                  <span className="timer-badge">Tiempo: {formatDuration(elapsedSeconds)}</span>
                </div>

                <p className="question-helper">
                  {session.gameId === 'input' &&
                    'Escribe el resultado y presiona responder para avanzar.'}
                  {session.gameId === 'choice' &&
                    'Toca una opcion correcta. Si fallas, aprenderas la respuesta al instante.'}
                  {session.gameId === 'voice' &&
                    'Di el resultado en voz alta usando numeros como "cuarenta y dos".'}
                </p>

                {session.gameId !== 'choice' && (
                  <div className="answer-row">
                    <input
                      inputMode="numeric"
                      value={inputValue}
                      disabled={isTransitioning}
                      onChange={(event) => setInputValue(event.target.value.replace(/[^\d]/g, ''))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          submitAnswer(inputValue)
                        }
                      }}
                      placeholder="Tu respuesta"
                      aria-label="Ingresa tu respuesta"
                    />
                    <button type="button" onClick={() => submitAnswer(inputValue)} disabled={isTransitioning}>
                      Responder
                    </button>
                    {session.gameId === 'voice' && (
                      <button
                        type="button"
                        className={`voice-button ${isListening ? 'listening' : ''}`}
                        onClick={startListening}
                        disabled={!speechRecognitionSupported || isTransitioning}
                      >
                        {isListening ? 'Escuchando...' : 'Responder con voz'}
                      </button>
                    )}
                  </div>
                )}

                {session.gameId === 'choice' && (
                  <div className="choice-grid">
                    {currentQuestion.choices.map((choice) => (
                      <button
                        key={`${currentQuestion.id}-${choice}`}
                        type="button"
                        className="choice-button"
                        disabled={isTransitioning}
                        onClick={() => submitAnswer(String(choice))}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}

                {session.gameId === 'voice' && (
                  <p className="voice-message">
                    {speechRecognitionSupported
                      ? voiceMessage ?? 'Tambien puedes escribir si prefieres.'
                      : 'Tu navegador no soporta voz. Puedes usar los otros juegos.'}
                  </p>
                )}

                {feedback && (
                  <div className={`feedback-card ${feedback.correct ? 'success' : 'error'}`}>
                    {feedback.message}
                  </div>
                )}
              </motion.section>
            ) : null}

            {!session && latestResult ? (
              <motion.section
                key={latestResult.id}
                className="result-panel"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
              >
                <p className="section-label">Fin de la partida</p>
                <h2>{latestResult.rating}</h2>
                <p className="student-result-name">Estudiante: {latestResult.studentName}</p>
                <p className="hero-description">{latestResult.encouragement}</p>

                <div className="result-stats">
                  <div>
                    <strong>
                      {latestResult.score}/{latestResult.total}
                    </strong>
                    <span>respuestas correctas</span>
                  </div>
                  <div>
                    <strong>{latestResult.accuracy}%</strong>
                    <span>precision</span>
                  </div>
                  <div>
                    <strong>{formatDuration(latestResult.durationSeconds)}</strong>
                    <span>tiempo total</span>
                  </div>
                </div>

                <div className="result-actions">
                  <button type="button" onClick={() => startGame(latestResult.gameId)}>
                    Jugar de nuevo
                  </button>
                  <button type="button" className="ghost-button" onClick={resetToHome}>
                    Elegir otro juego
                  </button>
                </div>

                <div className="answer-review">
                  {latestResult.answers.map((answer, index) => (
                    <div key={`${latestResult.id}-${answer.prompt}-${index}`} className={answer.correct ? 'correct' : 'wrong'}>
                      <span>{answer.prompt}</span>
                      <strong>
                        {answer.userAnswer} {answer.correct ? '✓' : `→ ${answer.expected}`}
                      </strong>
                    </div>
                  ))}
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </section>

        <aside className="panel report-panel">
          <div className="section-heading">
            <div>
              <p className="section-label">Seguimiento</p>
              <h2>{studentName ? `Historial de ${studentName}` : 'Historial y reportes'}</h2>
            </div>
          </div>

          {historyInsight ? (
            <>
              <div className="report-cards">
                <article>
                  <strong>{historyInsight.totalSessions}</strong>
                  <span>sesiones jugadas</span>
                </article>
                <article>
                  <strong>{historyInsight.averageAccuracy}%</strong>
                  <span>precision promedio</span>
                </article>
                <article>
                  <strong>{historyInsight.bestScore} aciertos</strong>
                  <span>mejor puntaje</span>
                </article>
                <article>
                  <strong>{historyInsight.favoriteGame}</strong>
                  <span>juego favorito</span>
                </article>
              </div>

              <div className="focus-box">
                <h3>Tablas para reforzar</h3>
                <p>
                  {historyInsight.focusTables.length > 0
                    ? historyInsight.focusTables.map((table) => `tabla del ${table}`).join(', ')
                    : 'Por ahora no hay tablas con errores repetidos. Sigue asi.'}
                </p>
              </div>

              <div className="history-list">
                {studentHistory.map((sessionRecord) => (
                  <article key={sessionRecord.id}>
                    <div>
                      <strong>{sessionRecord.gameName}</strong>
                      <span>
                        {new Intl.DateTimeFormat('es-CL', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(sessionRecord.playedAt))}
                      </span>
                    </div>
                    <div className="history-score">
                      <strong>
                        {sessionRecord.score}/{sessionRecord.total}
                      </strong>
                      <span>
                        {sessionRecord.rating} · {formatDuration(sessionRecord.durationSeconds)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h3>Tu historial aparecera aqui</h3>
              <p>
                {studentName
                  ? 'Juega la primera partida para comenzar a revisar avances, puntajes y tablas a reforzar.'
                  : 'Primero guarda el nombre del estudiante para empezar a registrar su progreso.'}
              </p>
            </div>
          )}
        </aside>
      </main>

      <section className="panel future-panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Siguiente etapa</p>
            <h2>Juegos planeados para mas adelante</h2>
          </div>
        </div>

        <div className="future-grid">
          {FUTURE_GAMES.map((game) => (
            <article key={game}>
              <span>Proximamente</span>
              <p>{game}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
