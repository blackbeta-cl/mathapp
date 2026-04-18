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
  challengeMode: boolean
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
  challengeMode: boolean
}

type DrawerMode = 'settings' | 'collectibles' | null

type StickerDefinition = {
  id: string
  name: string
  rewardTable: number
  rarity: 'clasico' | 'aventura' | 'premium' | 'legendario'
  description: string
  background: string
  accent: string
  emoji?: string
  imageSrc?: string
}

type EarnedSticker = StickerDefinition & {
  sessionId: string
  earnedAt: string
  sessionName: string
  accuracy: number
  weightedAccuracy: number
  dominantTable: number
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
const CHALLENGE_DURATION_MS = 10_000
const MAX_TABLE = 10
const MAX_QUESTION_COUNT = MAX_TABLE * MAX_TABLE
const TABLE_OPTIONS = Array.from({ length: MAX_TABLE }, (_, index) => index + 1)
const STICKER_BASE_PATH = `${import.meta.env.BASE_URL}stickers`

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

const STICKER_LIBRARY: StickerDefinition[] = [
  {
    id: 'table-1-rabbit',
    rewardTable: 1,
    rarity: 'clasico',
    name: 'Conejito veloz',
    description: 'Un premio amable para empezar a llenar el album.',
    background: 'linear-gradient(135deg, #fee2e2, #fbcfe8)',
    accent: '#9d174d',
    imageSrc: `${STICKER_BASE_PATH}/table-1-rabbit.svg`,
  },
  {
    id: 'table-2-squirrel',
    rewardTable: 2,
    rarity: 'clasico',
    name: 'Ardilla chispa',
    description: 'Ideal para sesiones cortas con buena precision.',
    background: 'linear-gradient(135deg, #ffedd5, #fdba74)',
    accent: '#9a3412',
    imageSrc: `${STICKER_BASE_PATH}/table-2-squirrel.svg`,
  },
  {
    id: 'table-2-turtle',
    rewardTable: 2,
    rarity: 'clasico',
    name: 'Tortuga amable',
    description: 'Otro premio suave para sesiones cuidadosas y constantes.',
    background: 'linear-gradient(135deg, #dcfce7, #86efac)',
    accent: '#166534',
    imageSrc: `${STICKER_BASE_PATH}/table-2-turtle.svg`,
  },
  {
    id: 'table-3-penguin',
    rewardTable: 3,
    rarity: 'clasico',
    name: 'Pinguino feliz',
    description: 'Marca una base solida en tablas tempranas.',
    background: 'linear-gradient(135deg, #dbeafe, #93c5fd)',
    accent: '#1d4ed8',
    imageSrc: `${STICKER_BASE_PATH}/table-3-penguin.svg`,
  },
  {
    id: 'table-3-hedgehog',
    rewardTable: 3,
    rarity: 'clasico',
    name: 'Erizo curioso',
    description: 'Suma variedad al album en los primeros avances.',
    background: 'linear-gradient(135deg, #fed7aa, #fdba74)',
    accent: '#9a3412',
    imageSrc: `${STICKER_BASE_PATH}/table-3-hedgehog.svg`,
  },
  {
    id: 'table-4-bear',
    rewardTable: 4,
    rarity: 'aventura',
    name: 'Oso tranquilo',
    description: 'El album empieza a ponerse mas interesante.',
    background: 'linear-gradient(135deg, #fde68a, #f59e0b)',
    accent: '#78350f',
    imageSrc: `${STICKER_BASE_PATH}/table-4-bear.svg`,
  },
  {
    id: 'table-5-fox',
    rewardTable: 5,
    rarity: 'aventura',
    name: 'Zorro astuto',
    description: 'Premio para sesiones de dificultad media.',
    background: 'linear-gradient(135deg, #fed7aa, #fb923c)',
    accent: '#7c2d12',
    imageSrc: `${STICKER_BASE_PATH}/table-5-fox.svg`,
  },
  {
    id: 'table-5-cow',
    rewardTable: 5,
    rarity: 'aventura',
    name: 'Vaquita risuena',
    description: 'Aparece cuando la practica media va tomando ritmo.',
    background: 'linear-gradient(135deg, #e0f2fe, #93c5fd)',
    accent: '#1d4ed8',
    imageSrc: `${STICKER_BASE_PATH}/table-5-cow.svg`,
  },
  {
    id: 'table-5-wild-boar',
    rewardTable: 5,
    rarity: 'aventura',
    name: 'Jabali valiente',
    description: 'Una variante extra para sesiones medianas bien resueltas.',
    background: 'linear-gradient(135deg, #e9d5ff, #c4b5fd)',
    accent: '#6d28d9',
    imageSrc: `${STICKER_BASE_PATH}/table-5-wild-boar.svg`,
  },
  {
    id: 'table-6-raccoon',
    rewardTable: 6,
    rarity: 'aventura',
    name: 'Mapache guardian',
    description: 'Marca que ya vienes subiendo de nivel.',
    background: 'linear-gradient(135deg, #e9d5ff, #c4b5fd)',
    accent: '#6d28d9',
    imageSrc: `${STICKER_BASE_PATH}/table-6-raccoon.svg`,
  },
  {
    id: 'table-6-crab',
    rewardTable: 6,
    rarity: 'aventura',
    name: 'Cangrejo alegre',
    description: 'Mas variedad en el tramo donde la dificultad empieza a subir.',
    background: 'linear-gradient(135deg, #fecaca, #fda4af)',
    accent: '#be123c',
    imageSrc: `${STICKER_BASE_PATH}/table-6-crab.svg`,
  },
  {
    id: 'table-6-shrimp',
    rewardTable: 6,
    rarity: 'aventura',
    name: 'Camaron chispeante',
    description: 'Premio adicional para sesiones medias con gran precision.',
    background: 'linear-gradient(135deg, #fde68a, #fb7185)',
    accent: '#9a3412',
    imageSrc: `${STICKER_BASE_PATH}/table-6-shrimp.svg`,
  },
  {
    id: 'premium-table-7-elk',
    rewardTable: 7,
    rarity: 'premium',
    name: 'Alce premium',
    description: 'Sticker premium para dominar tablas exigentes.',
    background: 'linear-gradient(135deg, #fdba74, #fb7185)',
    accent: '#ffffff',
    imageSrc: `${STICKER_BASE_PATH}/table-7-elk.svg`,
  },
  {
    id: 'premium-table-7-polar-bear',
    rewardTable: 7,
    rarity: 'premium',
    name: 'Oso polar premium',
    description: 'Otra recompensa premium para tablas cada vez mas exigentes.',
    background: 'linear-gradient(135deg, #dbeafe, #a5f3fc)',
    accent: '#0f172a',
    imageSrc: `${STICKER_BASE_PATH}/table-7-polar-bear.svg`,
  },
  {
    id: 'premium-table-8-lion',
    rewardTable: 8,
    rarity: 'premium',
    name: 'Leon campeon',
    description: 'Premio premium reservado a multiplicaciones complejas.',
    background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
    accent: '#78350f',
    imageSrc: `${STICKER_BASE_PATH}/table-8-lion.svg`,
  },
  {
    id: 'premium-table-9-whale',
    rewardTable: 9,
    rarity: 'legendario',
    name: 'Ballena legendaria',
    description: 'Un sticker elite para tablas muy dificiles.',
    background: 'linear-gradient(135deg, #93c5fd, #22d3ee)',
    accent: '#ffffff',
    imageSrc: `${STICKER_BASE_PATH}/table-9-whale.svg`,
  },
  {
    id: 'premium-table-9-crocodile',
    rewardTable: 9,
    rarity: 'legendario',
    name: 'Cocodrilo titan',
    description: 'Una variante legendaria reservada a tablas muy complejas.',
    background: 'linear-gradient(135deg, #86efac, #22c55e)',
    accent: '#14532d',
    imageSrc: `${STICKER_BASE_PATH}/table-9-crocodile.svg`,
  },
  {
    id: 'premium-table-10-dinosaur',
    rewardTable: 10,
    rarity: 'legendario',
    name: 'Dino supremo',
    description: 'La recompensa mas premium del album.',
    background: 'linear-gradient(135deg, #6ee7b7, #34d399)',
    accent: '#ffffff',
    imageSrc: `${STICKER_BASE_PATH}/table-10-dinosaur.svg`,
  },
  {
    id: 'premium-table-10-cute-animals',
    rewardTable: 10,
    rarity: 'legendario',
    name: 'Mega pandilla',
    description: 'Sticker especial para sesiones sobresalientes en el maximo nivel.',
    background: 'linear-gradient(135deg, #c4b5fd, #818cf8)',
    accent: '#ffffff',
    imageSrc: `${STICKER_BASE_PATH}/table-10-cute-animals.svg`,
  },
  {
    id: 'premium-table-10-cute-animals-2',
    rewardTable: 10,
    rarity: 'legendario',
    name: 'Fiesta final',
    description: 'Otra recompensa legendaria para cuando el estudiante brilla en tablas altas.',
    background: 'linear-gradient(135deg, #f9a8d4, #c084fc)',
    accent: '#ffffff',
    imageSrc: `${STICKER_BASE_PATH}/table-10-cute-animals-2.svg`,
  },
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
    challengeMode: settings.challengeMode,
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

function getTimestamp() {
  return new Date().getTime()
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

function getQuestionWeight(answer: Pick<AnswerRecord, 'factorA' | 'factorB' | 'expected'>) {
  const mainTable = Math.max(answer.factorA, answer.factorB)
  const supportTable = Math.min(answer.factorA, answer.factorB)

  return answer.expected + mainTable * 6 + supportTable * 2
}

function formatStickerRarity(rarity: StickerDefinition['rarity']) {
  switch (rarity) {
    case 'clasico':
      return 'Clasico'
    case 'aventura':
      return 'Aventura'
    case 'premium':
      return 'Premium'
    case 'legendario':
      return 'Legendario'
    default:
      return rarity
  }
}

function getStickerDefinitions(rewardTable: number) {
  const matchingStickers = STICKER_LIBRARY.filter((sticker) => sticker.rewardTable === rewardTable)

  return matchingStickers.length > 0
    ? matchingStickers
    : [STICKER_LIBRARY[STICKER_LIBRARY.length - 1]]
}

function getStickerRewardMetrics(answers: AnswerRecord[]) {
  const weightsByTable = new Map<number, number>()
  const totalWeight = answers.reduce((sum, answer) => sum + getQuestionWeight(answer), 0)
  const correctWeight = answers.reduce((sum, answer) => {
    if (!answer.correct) {
      return sum
    }

    const table = Math.max(answer.factorA, answer.factorB)
    const questionWeight = getQuestionWeight(answer)
    weightsByTable.set(table, (weightsByTable.get(table) ?? 0) + questionWeight)
    return sum + questionWeight
  }, 0)

  const weightedAccuracy = totalWeight > 0 ? Math.round((correctWeight / totalWeight) * 100) : 0
  const dominantTable =
    [...weightsByTable.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return right[0] - left[0]
    })[0]?.[0] ?? 1

  const eligible = answers.length > 0 && weightedAccuracy >= 90

  return {
    weightedAccuracy,
    dominantTable,
    rewardTable: Math.min(MAX_TABLE, dominantTable),
    eligible,
  }
}

function getEarnedSticker(session: SessionRecord, variantIndex = 0) {
  const rewardMetrics = getStickerRewardMetrics(session.answers)

  if (!rewardMetrics.eligible) {
    return null
  }

  const matchingStickers = getStickerDefinitions(rewardMetrics.rewardTable)
  const sticker = matchingStickers[variantIndex % matchingStickers.length]

  return {
    ...sticker,
    sessionId: session.id,
    earnedAt: session.playedAt,
    sessionName: session.gameName,
    accuracy: session.accuracy,
    weightedAccuracy: rewardMetrics.weightedAccuracy,
    dominantTable: rewardMetrics.dominantTable,
  } satisfies EarnedSticker
}

function getEarnedStickers(history: SessionRecord[]) {
  const countersByTable = new Map<number, number>()

  return history.flatMap((session) => {
    const rewardMetrics = getStickerRewardMetrics(session.answers)

    if (!rewardMetrics.eligible) {
      return []
    }

    const currentCount = countersByTable.get(rewardMetrics.rewardTable) ?? 0
    const sticker = getEarnedSticker(session, currentCount)

    countersByTable.set(rewardMetrics.rewardTable, currentCount + 1)

    return sticker ? [sticker] : []
  })
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
      challengeMode: false,
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
      challengeMode: Boolean(parsed.challengeMode),
    }
  } catch {
    return {
      prioritizeSelectedTables: false,
      prioritizedTables: [],
      questionCount: DEFAULT_QUESTION_COUNT,
      challengeMode: false,
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
  const [activeDrawer, setActiveDrawer] = useState<DrawerMode>(null)
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
  const [countdownNow, setCountdownNow] = useState(0)
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null)
  const sounds = useSoundEffects()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const nextQuestionTimeoutRef = useRef<number | null>(null)
  const studentKey = useMemo(() => getStudentKey(studentName), [studentName])

  const studentHistory = useMemo(
    () => history.filter((record) => getStudentKey(record.studentName) === studentKey),
    [history, studentKey],
  )
  const historyInsight = useMemo(() => getHistoryInsight(studentHistory), [studentHistory])
  const earnedStickers = useMemo(() => getEarnedStickers(studentHistory), [studentHistory])
  const earnedStickerCounts = useMemo(() => {
    return earnedStickers.reduce<Record<string, number>>((counts, sticker) => {
      counts[sticker.id] = (counts[sticker.id] ?? 0) + 1
      return counts
    }, {})
  }, [earnedStickers])
  const availableQuestionCount = useMemo(() => createQuestionPool(practiceSettings).length, [practiceSettings])
  const effectiveQuestionCount = useMemo(
    () => getEffectiveQuestionCount(practiceSettings),
    [practiceSettings],
  )
  const currentQuestion = session?.questions[session.currentIndex] ?? null
  const currentGame = session ? GAME_CONFIGS[session.gameId] : null
  const isPlaying = Boolean(session || latestResult)
  const speechRecognitionSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const fullscreenSupported = isFullscreenAvailable()
  const sessionStartedAt = session?.startedAt ?? null
  const elapsedSeconds = session ? timerTick : 0
  const challengeTimeLeftMs =
    session?.challengeMode && questionDeadline ? Math.max(0, questionDeadline - countdownNow) : null
  const challengeSecondsLeft =
    challengeTimeLeftMs === null ? null : Math.max(0, Math.ceil(challengeTimeLeftMs / 1000))
  const challengeUrgency =
    challengeTimeLeftMs === null ? 0 : 1 - challengeTimeLeftMs / CHALLENGE_DURATION_MS
  const latestEarnedSticker = latestResult ? earnedStickers.find((sticker) => sticker.sessionId === latestResult.id) ?? null : null

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
    if (!session?.challengeMode || !currentQuestion || isTransitioning || !questionDeadline) {
      return
    }

    const intervalId = window.setInterval(() => {
      setCountdownNow(getTimestamp())
    }, 100)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [currentQuestion, isTransitioning, questionDeadline, session?.challengeMode, session?.currentIndex])

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

  const finishSession = useCallback((finishedSession: SessionState, answers: AnswerRecord[]) => {
    const score = answers.filter((answer) => answer.correct).length
    const durationSeconds = Math.max(1, Math.round((getTimestamp() - finishedSession.startedAt) / 1000))
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
    setQuestionDeadline(null)
    setCountdownNow(0)
  }, [studentName])

  const queueNextStep = useCallback((updatedSession: SessionState, answers: AnswerRecord[], delay = 900) => {
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
      const nextTimestamp = getTimestamp()
      setInputValue('')
      setFeedback(null)
      setIsTransitioning(false)
      setIsListening(false)
      setVoiceMessage(null)
      setQuestionDeadline(updatedSession.challengeMode ? nextTimestamp + CHALLENGE_DURATION_MS : null)
      setCountdownNow(nextTimestamp)
    }, delay)
  }, [finishSession])

  const submitAnswer = useCallback((
    userAnswer: string,
    options?: {
      allowBlank?: boolean
      delay?: number
      userAnswerLabel?: string
      feedbackMessage?: string
      voiceMessageOverride?: string
    },
  ) => {
    if (!session || !currentQuestion || isTransitioning) {
      return
    }

    const trimmedAnswer = userAnswer.trim()

    if (!trimmedAnswer && !options?.allowBlank) {
      return
    }

    const numericAnswer = Number(trimmedAnswer)
    const correct = numericAnswer === currentQuestion.answer
    const answerRecord: AnswerRecord = {
      prompt: currentQuestion.prompt,
      factorA: currentQuestion.factorA,
      factorB: currentQuestion.factorB,
      expected: currentQuestion.answer,
      userAnswer: options?.userAnswerLabel ?? trimmedAnswer,
      correct,
      gameId: session.gameId,
    }

    const answers = [...session.answers, answerRecord]

    setFeedback({
      correct,
      message:
        options?.feedbackMessage ??
        (correct
          ? 'Muy bien. La siguiente viene en camino.'
          : `Casi. La respuesta correcta era ${currentQuestion.answer}.`),
    })

    if (session.gameId === 'voice') {
      setVoiceMessage(
        options?.voiceMessageOverride ??
          (correct
            ? `Muy bien. Dijiste ${trimmedAnswer} y era correcto.`
            : `Escuche ${trimmedAnswer || 'silencio'}, pero la respuesta correcta es ${currentQuestion.answer}.`),
      )
    }

    if (correct) {
      sounds.playCorrect()
    } else {
      sounds.playWrong()
    }

    queueNextStep(
      session,
      answers,
      options?.delay ?? (session.gameId === 'voice' && !correct ? 1800 : 900),
    )
  }, [currentQuestion, isTransitioning, queueNextStep, session, sounds])

  useEffect(() => {
    if (!session?.challengeMode || !currentQuestion || isTransitioning || challengeTimeLeftMs !== 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      submitAnswer('', {
        allowBlank: true,
        delay: 1800,
        userAnswerLabel: 'Tiempo agotado',
        feedbackMessage: `Se acabo el tiempo. La respuesta correcta era ${currentQuestion.answer}.`,
        voiceMessageOverride: `Tiempo agotado. La respuesta correcta para ${currentQuestion.prompt} era ${currentQuestion.answer}.`,
      })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [challengeTimeLeftMs, currentQuestion, isTransitioning, session?.challengeMode, submitAnswer])

  const startGame = (gameId: GameId) => {
    if (!studentName) {
      setStudentNameError('Ingresa el nombre del estudiante antes de comenzar.')
      return
    }

    recognitionRef.current?.stop()
    sounds.playTap()
    setLatestResult(null)
    setActiveDrawer(null)
    setFeedback(null)
    setInputValue('')
    setIsTransitioning(false)
    setIsListening(false)
    setTimerTick(0)
    setVoiceMessage(null)
    const nextTimestamp = getTimestamp()
    setQuestionDeadline(practiceSettings.challengeMode ? nextTimestamp + CHALLENGE_DURATION_MS : null)
    setCountdownNow(nextTimestamp)
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
    setActiveDrawer(null)
    setStudentNameError(null)
    setLatestResult(null)
  }

  const editStudentName = () => {
    sounds.playTap()
    setStudentNameInput(studentName)
    setIsEditingStudentName(true)
    setActiveDrawer('settings')
    setStudentNameError(null)
  }

  const openSettings = () => {
    sounds.playTap()
    setActiveDrawer('settings')
  }

  const openCollectibles = () => {
    sounds.playTap()
    setActiveDrawer('collectibles')
  }

  const closeDrawer = () => {
    setActiveDrawer(null)
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

  const toggleChallengeMode = () => {
    sounds.playTap()
    setPracticeSettings((currentSettings) => ({
      ...currentSettings,
      challengeMode: !currentSettings.challengeMode,
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
    setLatestResult(null)
    setActiveDrawer(null)
    setFeedback(null)
    setInputValue('')
    setIsTransitioning(false)
    setIsListening(false)
    setTimerTick(0)
    setVoiceMessage(null)
    setQuestionDeadline(null)
    setCountdownNow(0)
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

  if (!studentName) {
    return (
      <div className="app-shell">
        <section className="panel onboarding-panel">
          <div className="onboarding-content">
            <p className="eyebrow">Bienvenido a Math &gt; 3 basico &gt; Multiplicaciones</p>
            <h1>Antes de empezar, cuentame tu nombre</h1>
            <p className="hero-description">
              Lo usare para guardar tu progreso en este dispositivo y mostrarte tus resultados.
            </p>

            <div className="onboarding-form">
              <input
                type="text"
                value={studentNameInput}
                onChange={(event) => setStudentNameInput(event.target.value)}
                placeholder="Ejemplo: Mateo"
                aria-label="Nombre del estudiante"
              />
              <button type="button" onClick={saveStudentName}>
                Comenzar
              </button>
            </div>

            {studentNameError && <p className="student-note">{studentNameError}</p>}

            <div className="hero-pills">
              <span>Tu nombre es obligatorio</span>
              <span>Se guarda solo en este navegador</span>
              <span>Luego podras editarlo</span>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-topbar panel">
        <div>
          <p className="eyebrow">Math &gt; 3 basico &gt; Multiplicaciones</p>
          <p className="student-greeting">Hola, {studentName}! Listo para jugar y aprender.</p>
        </div>

        <div className="topbar-actions">
          <div className="student-chip">
            <span>{studentName}</span>
            <button
              type="button"
              className="icon-button"
              onClick={editStudentName}
              aria-label="Editar nombre del estudiante"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 20h4l10-10-4-4L4 16v4Zm13.7-11.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15 6l2.7 2.7Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="icon-button settings-toggle"
            onClick={openCollectibles}
            aria-label="Abrir coleccionables"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m12 2 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 15.8 6.7 18l1-5.8-4.2-4.1 5.9-.9L12 2Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <button
            type="button"
            className="icon-button settings-toggle"
            onClick={openSettings}
            aria-label="Abrir configuracion"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 .1 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 2.6h4l.3-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <button
            type="button"
            className="fullscreen-button"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
        </div>
      </header>

      {fullscreenError && <p className="fullscreen-note">{fullscreenError}</p>}

      {activeDrawer && (
        <button type="button" className="drawer-backdrop" aria-label="Cerrar panel lateral" onClick={closeDrawer} />
      )}

      <aside className={`settings-drawer ${activeDrawer ? 'open' : ''}`} aria-hidden={!activeDrawer}>
        <div className="settings-drawer-header">
          <div>
            <p className="section-label">{activeDrawer === 'collectibles' ? 'Coleccionables' : 'Configuracion'}</p>
            <h2>{activeDrawer === 'collectibles' ? 'Premios del estudiante' : 'Ajustes de la partida'}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={closeDrawer}>
            Cerrar
          </button>
        </div>

        {activeDrawer === 'collectibles' ? (
          <section className="settings-card drawer-card">
            <div className="settings-header">
              <div>
                <p className="section-label">Album</p>
                <h3>Stickers ganados</h3>
              </div>
              <span className="question-count-pill">{earnedStickers.length} stickers</span>
            </div>

            <p className="settings-description">
              Los stickers se desbloquean con 90% o mas de precision ponderada. Las tablas mas complejas entregan premios mas premium.
            </p>

            <div className="section-heading compact-heading">
              <div>
                <p className="section-label">Coleccion completa</p>
                <h3>Todos los stickers disponibles</h3>
              </div>
            </div>

            <div className="sticker-catalog-grid">
              {STICKER_LIBRARY.map((sticker) => {
                const earnedCount = earnedStickerCounts[sticker.id] ?? 0
                const isUnlocked = earnedCount > 0

                return (
                  <article
                    key={sticker.id}
                    className={`sticker-catalog-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                  >
                    <div
                      className="sticker-badge sticker-badge-large"
                      style={{ background: sticker.background, color: sticker.accent }}
                      aria-hidden="true"
                    >
                      {sticker.imageSrc ? <img src={sticker.imageSrc} alt="" loading="lazy" /> : <span>{sticker.emoji}</span>}
                    </div>

                    {earnedCount > 1 && <span className="sticker-count-badge">x{earnedCount}</span>}

                    <div className="sticker-title-row">
                      <strong>{sticker.name}</strong>
                      <span className={`sticker-rarity sticker-rarity-${sticker.rarity}`}>
                        {formatStickerRarity(sticker.rarity)}
                      </span>
                    </div>

                    <p>Se gana dominando una sesion donde destaque la tabla del {sticker.rewardTable}.</p>
                    <small>{sticker.description}</small>
                    <span className={`sticker-status ${isUnlocked ? 'earned' : 'locked'}`}>
                      {isUnlocked ? 'Ganado' : 'Aun no ganado'}
                    </span>
                  </article>
                )
              })}
            </div>

            <div className="section-heading compact-heading">
              <div>
                <p className="section-label">Historial</p>
                <h3>Premios ya obtenidos</h3>
              </div>
            </div>

            {earnedStickers.length > 0 ? (
              <div className="sticker-grid">
                {earnedStickers.map((sticker) => (
                  <article key={sticker.sessionId} className="sticker-card">
                    <div
                      className="sticker-badge"
                      style={{ background: sticker.background, color: sticker.accent }}
                      aria-hidden="true"
                    >
                      {sticker.imageSrc ? <img src={sticker.imageSrc} alt="" loading="lazy" /> : <span>{sticker.emoji}</span>}
                    </div>
                    <div>
                      <div className="sticker-title-row">
                        <strong>{sticker.name}</strong>
                        <span className={`sticker-rarity sticker-rarity-${sticker.rarity}`}>
                          {formatStickerRarity(sticker.rarity)}
                        </span>
                      </div>
                      <p>
                        {sticker.sessionName} · Tabla dominante {sticker.dominantTable} · {sticker.weightedAccuracy}% ponderado
                      </p>
                      <small>{sticker.description}</small>
                      <small>
                        {new Intl.DateTimeFormat('es-CL', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(sticker.earnedAt))}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>Tu album aun esta vacio</h3>
                <p>Juega, supera el 90% ponderado y empezaras a llenar tu coleccion de premios.</p>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="settings-card drawer-card">
              <div className="settings-header">
                <div>
                  <p className="section-label">Estudiante</p>
                  <h3>Perfil activo</h3>
                </div>
              </div>

              {isEditingStudentName ? (
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
              ) : (
                <div className="student-card">
                  <div>
                    <p className="section-label">Perfil activo</p>
                    <strong>{studentName}</strong>
                  </div>
                  <button
                    type="button"
                    className="edit-student-button"
                    onClick={editStudentName}
                    aria-label="Editar nombre del estudiante"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 20h4l10-10-4-4L4 16v4Zm13.7-11.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L15 6l2.7 2.7Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              )}

              <p className="settings-summary">
                Tu progreso y resultados se guardan con este nombre en este navegador.
              </p>
              {studentNameError && <p className="student-note">{studentNameError}</p>}
            </section>

            <section className="settings-card drawer-card">
              <div className="settings-header">
                <div>
                  <p className="section-label">Practica</p>
                  <h3>Priorizar tablas y duracion</h3>
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
                Ajusta las tablas que quieres reforzar, cuantos ejercicios unicos quieres por partida y si quieres activar el reto contrarreloj.
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

              <label className="challenge-toggle">
                <input
                  type="checkbox"
                  checked={practiceSettings.challengeMode}
                  onChange={toggleChallengeMode}
                />
                <span>
                  <strong>Modo desafio</strong>
                  <small>10 segundos por pregunta con cuenta regresiva y alerta roja.</small>
                </span>
              </label>

              <p className="settings-summary">
                {practiceSettings.prioritizeSelectedTables && practiceSettings.prioritizedTables.length > 0
                  ? `Prioridad activa en: ${practiceSettings.prioritizedTables.join(', ')}. `
                  : 'Sin prioridad activa. '}
                {practiceSettings.questionCount > effectiveQuestionCount
                  ? `Se ajustara a ${effectiveQuestionCount} ejercicios unicos. `
                  : `Cada juego tendra ${effectiveQuestionCount} ejercicios unicos. `}
                {practiceSettings.challengeMode
                  ? 'El modo desafio esta activo con 10 segundos por pregunta.'
                  : 'El modo desafio esta desactivado.'}
              </p>
            </section>
          </>
        )}
      </aside>

      {!isPlaying ? (
        <>
          <header className="hero-panel">
            <div className="hero-copy">
              <h1>Tablas divertidas para aprender jugando</h1>
              <p className="hero-description">
                Sesiones cortas, feedback positivo e historial de avances para reforzar las tablas
                del 1 al 10.
              </p>

              <div className="hero-pills">
                <span>Tablas del 1 al 10</span>
                <span>{effectiveQuestionCount} ejercicios por partida</span>
                <span>Historial con reportes</span>
                <span>{practiceSettings.challengeMode ? 'Modo desafio activo' : 'Modo desafio opcional'}</span>
                <span>Configuracion rapida desde la esquina</span>
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
                    <button type="button" onClick={() => startGame(game.id)}>
                      {game.actionLabel}
                    </button>
                  </motion.article>
                ))}
              </div>
            </section>

            <aside className="panel report-panel">
              <div className="section-heading">
                <div>
                  <p className="section-label">Seguimiento</p>
                  <h2>Historial de {studentName}</h2>
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
                  <p>Juega la primera partida para comenzar a revisar avances, puntajes y tablas a reforzar.</p>
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
        </>
      ) : (
        <main className="play-screen">
          {session?.challengeMode && (
            <div
              className="challenge-overlay"
              style={{ '--challenge-urgency': challengeUrgency } as React.CSSProperties}
              aria-hidden="true"
            />
          )}

          <section className="panel game-panel game-focused-panel">
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
                    {session.challengeMode && challengeSecondsLeft !== null && (
                      <span className={`timer-badge challenge-timer ${challengeSecondsLeft <= 3 ? 'urgent' : ''}`}>
                        Desafio: {challengeSecondsLeft}s
                      </span>
                    )}
                  </div>

                  <p className="question-helper">
                    {session.gameId === 'input' &&
                      'Escribe el resultado y presiona responder para avanzar.'}
                    {session.gameId === 'choice' &&
                      'Toca una opcion correcta. Si fallas, aprenderas la respuesta al instante.'}
                    {session.gameId === 'voice' &&
                      'Di el resultado en voz alta usando numeros como "cuarenta y dos".'}
                  </p>

                  {session.challengeMode && (
                    <p className="challenge-helper">
                      Cada pregunta dura 10 segundos. Si el reloj llega a cero, cuenta como incorrecta.
                    </p>
                  )}

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
                      Volver al inicio
                    </button>
                  </div>

                  {latestEarnedSticker && (
                    <div className="reward-banner">
                      <div
                        className="sticker-badge"
                        style={{ background: latestEarnedSticker.background, color: latestEarnedSticker.accent }}
                        aria-hidden="true"
                      >
                        {latestEarnedSticker.imageSrc ? (
                          <img src={latestEarnedSticker.imageSrc} alt="" />
                        ) : (
                          <span>{latestEarnedSticker.emoji}</span>
                        )}
                      </div>
                      <div>
                        <div className="sticker-title-row">
                          <strong>Nuevo sticker desbloqueado: {latestEarnedSticker.name}</strong>
                          <span className={`sticker-rarity sticker-rarity-${latestEarnedSticker.rarity}`}>
                            {formatStickerRarity(latestEarnedSticker.rarity)}
                          </span>
                        </div>
                        <p>
                          Ganado con {latestEarnedSticker.weightedAccuracy}% ponderado y tabla dominante{' '}
                          {latestEarnedSticker.dominantTable}.
                        </p>
                      </div>
                    </div>
                  )}

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
        </main>
      )}
    </div>
  )
}

export default App
