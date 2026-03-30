import { createHotkeys, formatForDisplay } from '@tanstack/solid-hotkeys'
import { For, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import './App.css'

type Point = {
  x: number
  y: number
}

type Segment = {
  cp1: Point
  cp2: Point
}

type Curve = {
  anchors: Point[]
  segments: Segment[]
}

type EditorState = {
  curve: Curve
  selectedSegment: number
}

type DragTarget =
  | { kind: 'anchor'; index: number }
  | { kind: 'cp1'; index: number }
  | { kind: 'cp2'; index: number }

type PreviewMode =
  | 'move-x'
  | 'move-y'
  | 'scale-x'
  | 'scale-y'
  | 'scale'
  | 'rotate-z'
  | 'opacity'
  | 'rotate-x'
  | 'rotate-y'

type SamplingMode = 'regular' | 'smart'

const VIEWBOX_WIDTH = 1000
const VIEWBOX_HEIGHT = 940
const GRAPH_LEFT = 72
const GRAPH_TOP = 44
const GRAPH_WIDTH = VIEWBOX_WIDTH - GRAPH_LEFT * 2
const GRAPH_HEIGHT = VIEWBOX_HEIGHT - GRAPH_TOP * 2
const Y_MIN = -1
const Y_MAX = 2
const MIN_ANCHOR_GAP = 0.002
const PREVIEW_HOLD = 1000

const point = (x: number, y: number): Point => ({ x, y })

const PRESETS: Array<{ label: string; curve: Curve }> = [
  {
    label: 'Ease',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.18, 0), cp2: point(0.72, 1) }],
    },
  },
  {
    label: 'Overshoot',
    curve: {
      anchors: [point(0, 0), point(0.55, 1.16), point(1, 1)],
      segments: [
        { cp1: point(0.12, 0.02), cp2: point(0.32, 1.18) },
        { cp1: point(0.72, 1.14), cp2: point(0.88, 0.98) },
      ],
    },
  },
  {
    label: 'Bounce',
    curve: {
      anchors: [point(0, 0), point(0.46, 1.12), point(0.72, 0.86), point(1, 1)],
      segments: [
        { cp1: point(0.14, 0), cp2: point(0.3, 1.2) },
        { cp1: point(0.58, 1.08), cp2: point(0.64, 0.86) },
        { cp1: point(0.82, 0.86), cp2: point(0.92, 1.02) },
      ],
    },
  },
  {
    label: 'Anticipate',
    curve: {
      anchors: [point(0, 0), point(0.24, -0.18), point(1, 1)],
      segments: [
        { cp1: point(0.08, 0), cp2: point(0.18, -0.18) },
        { cp1: point(0.4, -0.18), cp2: point(0.78, 1.08) },
      ],
    },
  },
]

const PREVIEW_MODES: Array<{ id: PreviewMode; label: string }> = [
  { id: 'move-x', label: 'Move x' },
  { id: 'move-y', label: 'Move y' },
  { id: 'scale-x', label: 'Scale x' },
  { id: 'scale-y', label: 'Scale y' },
  { id: 'scale', label: 'Scale' },
  { id: 'rotate-z', label: 'Rotate z 90deg' },
  { id: 'opacity', label: 'Opacity' },
  { id: 'rotate-x', label: 'Rotate x 180deg' },
  { id: 'rotate-y', label: 'Rotate y 180deg' },
]

const SAMPLING_MODES: Array<{ id: SamplingMode; label: string; note: string }> = [
  { id: 'smart', label: 'smart sampling', note: 'Adds stops where the curve bends most' },
  { id: 'regular', label: 'regular sampling', note: 'Spaces stops evenly across progress' },
]

const SMART_SAMPLE_RATIOS = [1 / 6, 1 / 3, 1 / 2, 2 / 3, 5 / 6]
const MIN_LINEAR_STOP_GAP = 0.0001
const MIN_SMART_SAMPLE_ERROR = 0.000001

const UNDO_HOTKEY_LABEL = formatForDisplay('Mod+Z')
const REDO_HOTKEY_LABEL = formatForDisplay('Mod+Shift+Z')
const COPY_HOTKEY_LABEL = formatForDisplay('Mod+C')
const SHIFT_LABEL = formatForDisplay('Shift')
const MOD_CLICK_LABEL = `${formatForDisplay('Mod')}+Click`

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount

const formatNumber = (value: number, digits = 4) => {
  const rounded = Number.parseFloat(value.toFixed(digits))
  return Number.isFinite(rounded) ? `${rounded}` : '0'
}

const formatPercent = (value: number) => `${formatNumber(value * 100, 2)}%`

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const highlightCss = (value: string) => {
  const tokenPattern = /([a-z-]+(?=:)|\b[a-z-]+(?=\()|-?\d*\.?\d+%?)/gi

  return escapeHtml(value).replace(tokenPattern, (token, _match, offset) => {
    const nextCharacter = value[offset + token.length]

    if (/^[a-z-]+$/i.test(token)) {
      if (nextCharacter === ':') {
        return `<span class="token-property">${token}</span>`
      }

      return `<span class="token-function">${token}</span>`
    }

    return `<span class="token-number">${token}</span>`
  })
}

const copyText = async (value: string) => {
  try {
    await Promise.race([
      window.navigator.clipboard.writeText(value),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timeout')), 150)),
    ])
    return true
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    input.setAttribute('readonly', 'true')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.append(input)
    input.select()

    try {
      return document.execCommand('copy')
    } finally {
      input.remove()
    }
  }
}

const clonePoint = (value: Point): Point => ({ ...value })

const cloneCurve = (curve: Curve): Curve => ({
  anchors: curve.anchors.map(clonePoint),
  segments: curve.segments.map((segment) => ({
    cp1: clonePoint(segment.cp1),
    cp2: clonePoint(segment.cp2),
  })),
})

const cloneEditorState = (state: EditorState): EditorState => ({
  curve: cloneCurve(state.curve),
  selectedSegment: state.selectedSegment,
})

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const inverse = 1 - t
  return (
    inverse ** 3 * p0 +
    3 * inverse ** 2 * t * p1 +
    3 * inverse * t ** 2 * p2 +
    t ** 3 * p3
  )
}

const xToSvg = (x: number) => GRAPH_LEFT + x * GRAPH_WIDTH

const yToSvg = (y: number) =>
  GRAPH_TOP + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * GRAPH_HEIGHT

const buildCurvePath = (curve: Curve) => {
  const [firstAnchor] = curve.anchors

  return curve.segments.reduce(
    (path, segment, index) =>
      `${path} C ${xToSvg(segment.cp1.x)} ${yToSvg(segment.cp1.y)}, ${xToSvg(segment.cp2.x)} ${yToSvg(segment.cp2.y)}, ${xToSvg(curve.anchors[index + 1].x)} ${yToSvg(curve.anchors[index + 1].y)}`,
    `M ${xToSvg(firstAnchor.x)} ${yToSvg(firstAnchor.y)}`,
  )
}

const buildSegmentPath = (curve: Curve, index: number) => {
  const anchor = curve.anchors[index]
  const nextAnchor = curve.anchors[index + 1]
  const segment = curve.segments[index]

  return `M ${xToSvg(anchor.x)} ${yToSvg(anchor.y)} C ${xToSvg(segment.cp1.x)} ${yToSvg(segment.cp1.y)}, ${xToSvg(segment.cp2.x)} ${yToSvg(segment.cp2.y)}, ${xToSvg(nextAnchor.x)} ${yToSvg(nextAnchor.y)}`
}

const buildLinePath = (points: Point[]) =>
  points.reduce(
    (path, current, index) =>
      `${path}${index === 0 ? 'M' : ' L'} ${xToSvg(current.x)} ${yToSvg(current.y)}`,
    '',
  )

const normalizeCurve = (curve: Curve): Curve => {
  const nextCurve = cloneCurve(curve)
  const lastAnchorIndex = nextCurve.anchors.length - 1

  nextCurve.anchors[0] = point(0, 0)
  nextCurve.anchors[lastAnchorIndex] = point(1, 1)

  for (let index = 1; index < lastAnchorIndex; index += 1) {
    const minX = nextCurve.anchors[index - 1].x + MIN_ANCHOR_GAP
    const maxX = nextCurve.anchors[index + 1].x - MIN_ANCHOR_GAP
    nextCurve.anchors[index].x = clamp(nextCurve.anchors[index].x, minX, maxX)
  }

  nextCurve.segments.forEach((segment, index) => {
    const startX = nextCurve.anchors[index].x
    const endX = nextCurve.anchors[index + 1].x
    let cp1X = clamp(segment.cp1.x, startX, endX)
    let cp2X = clamp(segment.cp2.x, startX, endX)

    if (cp1X > cp2X) {
      const midpoint = (cp1X + cp2X) / 2
      cp1X = midpoint
      cp2X = midpoint
    }

    segment.cp1 = point(cp1X, segment.cp1.y)
    segment.cp2 = point(cp2X, segment.cp2.y)
  })

  return nextCurve
}

const normalizeEditorState = (state: EditorState): EditorState => {
  const curve = normalizeCurve(state.curve)
  return {
    curve,
    selectedSegment: clamp(state.selectedSegment, 0, curve.segments.length - 1),
  }
}

const editorStatesEqual = (left: EditorState, right: EditorState) =>
  JSON.stringify(left) === JSON.stringify(right)

const splitSegmentAt = (curve: Curve, segmentIndex: number, splitT: number): Curve => {
  const nextCurve = cloneCurve(curve)
  const start = nextCurve.anchors[segmentIndex]
  const end = nextCurve.anchors[segmentIndex + 1]
  const segment = nextCurve.segments[segmentIndex]
  const t = clamp(splitT, 0.001, 0.999)

  const ab = point(lerp(start.x, segment.cp1.x, t), lerp(start.y, segment.cp1.y, t))
  const bc = point(
    lerp(segment.cp1.x, segment.cp2.x, t),
    lerp(segment.cp1.y, segment.cp2.y, t),
  )
  const cd = point(lerp(segment.cp2.x, end.x, t), lerp(segment.cp2.y, end.y, t))
  const abbc = point(lerp(ab.x, bc.x, t), lerp(ab.y, bc.y, t))
  const bccd = point(lerp(bc.x, cd.x, t), lerp(bc.y, cd.y, t))
  const midpoint = point(lerp(abbc.x, bccd.x, t), lerp(abbc.y, bccd.y, t))

  nextCurve.anchors.splice(segmentIndex + 1, 0, midpoint)
  nextCurve.segments.splice(
    segmentIndex,
    1,
    { cp1: ab, cp2: abbc },
    { cp1: bccd, cp2: cd },
  )

  return normalizeCurve(nextCurve)
}

const splitSegment = (curve: Curve, segmentIndex: number): Curve =>
  splitSegmentAt(curve, segmentIndex, 0.5)

const findClosestTOnSegment = (curve: Curve, segmentIndex: number, target: Point) => {
  let bestT = 0.5
  let bestDistance = Number.POSITIVE_INFINITY

  for (let step = 0; step <= 40; step += 1) {
    const t = step / 40
    const current = pointOnSegment(curve, segmentIndex, t)
    const distance = (current.x - target.x) ** 2 + (current.y - target.y) ** 2

    if (distance < bestDistance) {
      bestDistance = distance
      bestT = t
    }
  }

  let window = 1 / 20

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const start = Math.max(0, bestT - window)
    const end = Math.min(1, bestT + window)

    for (let step = 0; step <= 16; step += 1) {
      const t = start + ((end - start) * step) / 16
      const current = pointOnSegment(curve, segmentIndex, t)
      const distance = (current.x - target.x) ** 2 + (current.y - target.y) ** 2

      if (distance < bestDistance) {
        bestDistance = distance
        bestT = t
      }
    }

    window /= 3
  }

  return bestT
}

const removeAnchor = (curve: Curve, anchorIndex: number): Curve => {
  if (anchorIndex <= 0 || anchorIndex >= curve.anchors.length - 1) {
    return curve
  }

  const nextCurve = cloneCurve(curve)
  const previousAnchor = nextCurve.anchors[anchorIndex - 1]
  const followingAnchor = nextCurve.anchors[anchorIndex + 1]
  const previousSegment = nextCurve.segments[anchorIndex - 1]
  const nextSegment = nextCurve.segments[anchorIndex]

  nextCurve.anchors.splice(anchorIndex, 1)
  nextCurve.segments.splice(anchorIndex - 1, 2, {
    cp1: point(
      previousAnchor.x + (previousSegment.cp1.x - previousAnchor.x) * 2,
      previousAnchor.y + (previousSegment.cp1.y - previousAnchor.y) * 2,
    ),
    cp2: point(
      followingAnchor.x + (nextSegment.cp2.x - followingAnchor.x) * 2,
      followingAnchor.y + (nextSegment.cp2.y - followingAnchor.y) * 2,
    ),
  })

  return normalizeCurve(nextCurve)
}

const removeSegment = (curve: Curve, segmentIndex: number): Curve => {
  if (curve.segments.length === 1) {
    return curve
  }

  const anchorToRemove = segmentIndex < curve.segments.length - 1 ? segmentIndex + 1 : segmentIndex
  return removeAnchor(curve, anchorToRemove)
}

const curveValueAtX = (curve: Curve, x: number) => {
  const clampedX = clamp(x, 0, 1)
  let segmentIndex = curve.segments.length - 1

  for (let index = 0; index < curve.segments.length; index += 1) {
    if (clampedX <= curve.anchors[index + 1].x || index === curve.segments.length - 1) {
      segmentIndex = index
      break
    }
  }

  const start = curve.anchors[segmentIndex]
  const end = curve.anchors[segmentIndex + 1]
  const segment = curve.segments[segmentIndex]

  if (clampedX <= start.x) {
    return start.y
  }

  if (clampedX >= end.x) {
    return end.y
  }

  let low = 0
  let high = 1

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const midpoint = (low + high) / 2
    const estimate = cubic(start.x, segment.cp1.x, segment.cp2.x, end.x, midpoint)

    if (estimate < clampedX) {
      low = midpoint
    } else {
      high = midpoint
    }
  }

  const t = (low + high) / 2
  return cubic(start.y, segment.cp1.y, segment.cp2.y, end.y, t)
}

const sampleLinearStopsRegular = (curve: Curve, stopCount: number) => {
  const safeCount = Math.max(2, stopCount)
  return Array.from({ length: safeCount }, (_, index) => {
    const x = index / (safeCount - 1)
    return point(x, curveValueAtX(curve, x))
  })
}

const getSmartSplitPoint = (curve: Curve, start: Point, end: Point) => {
  const span = end.x - start.x

  if (span <= MIN_LINEAR_STOP_GAP * 2) {
    return null
  }

  const candidateXs: number[] = []
  const addCandidateX = (x: number) => {
    if (x <= start.x + MIN_LINEAR_STOP_GAP || x >= end.x - MIN_LINEAR_STOP_GAP) {
      return
    }

    if (candidateXs.some((candidateX) => Math.abs(candidateX - x) < MIN_LINEAR_STOP_GAP)) {
      return
    }

    candidateXs.push(x)
  }

  SMART_SAMPLE_RATIOS.forEach((ratio) => addCandidateX(lerp(start.x, end.x, ratio)))
  curve.anchors.forEach((anchor) => addCandidateX(anchor.x))

  let bestPoint: Point | null = null
  let bestError = -1

  candidateXs.forEach((x) => {
    const amount = (x - start.x) / span
    const curveY = curveValueAtX(curve, x)
    const linearY = lerp(start.y, end.y, amount)
    const error = Math.abs(curveY - linearY)

    if (error > bestError) {
      bestPoint = point(x, curveY)
      bestError = error
    }
  })

  if (!bestPoint) {
    return null
  }

  return {
    point: bestPoint,
    error: bestError,
  }
}

const sampleLinearStopsSmart = (curve: Curve, stopCount: number) => {
  const safeCount = Math.max(2, stopCount)
  const points = [point(0, curveValueAtX(curve, 0)), point(1, curveValueAtX(curve, 1))]

  // Spend the stop budget where the current piecewise-linear approximation misses most.
  while (points.length < safeCount) {
    let bestSplit:
      | {
          index: number
          point: Point
          error: number
        }
      | null = null

    for (let index = 0; index < points.length - 1; index += 1) {
      const split = getSmartSplitPoint(curve, points[index], points[index + 1])

      if (!split) {
        continue
      }

      if (!bestSplit || split.error > bestSplit.error) {
        bestSplit = { index, ...split }
      }
    }

    if (!bestSplit || bestSplit.error <= MIN_SMART_SAMPLE_ERROR) {
      break
    }

    points.splice(bestSplit.index + 1, 0, bestSplit.point)
  }

  return points
}

const sampleLinearStops = (curve: Curve, stopCount: number, samplingMode: SamplingMode) =>
  samplingMode === 'smart'
    ? sampleLinearStopsSmart(curve, stopCount)
    : sampleLinearStopsRegular(curve, stopCount)

const evaluateLinearStops = (points: Point[], x: number) => {
  const clampedX = clamp(x, 0, 1)

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]

    if (clampedX <= next.x || index === points.length - 2) {
      const span = next.x - current.x || 1
      const amount = (clampedX - current.x) / span
      return lerp(current.y, next.y, amount)
    }
  }

  return points[points.length - 1].y
}

const formatLinearFunction = (points: Point[]) =>
  `linear(${points
    .map((current) => `${formatNumber(current.y)} ${formatPercent(current.x)}`)
    .join(', ')})`

const clientPointToCurve = (
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
): Point => {
  const bounds = svg.getBoundingClientRect()
  const svgX = ((clientX - bounds.left) / bounds.width) * VIEWBOX_WIDTH
  const svgY = ((clientY - bounds.top) / bounds.height) * VIEWBOX_HEIGHT

  return point(
    clamp((svgX - GRAPH_LEFT) / GRAPH_WIDTH, 0, 1),
    clamp(Y_MAX - ((svgY - GRAPH_TOP) / GRAPH_HEIGHT) * (Y_MAX - Y_MIN), Y_MIN, Y_MAX),
  )
}

const pointOnSegment = (curve: Curve, segmentIndex: number, t: number): Point => {
  const start = curve.anchors[segmentIndex]
  const end = curve.anchors[segmentIndex + 1]
  const segment = curve.segments[segmentIndex]

  return point(
    cubic(start.x, segment.cp1.x, segment.cp2.x, end.x, t),
    cubic(start.y, segment.cp1.y, segment.cp2.y, end.y, t),
  )
}

const updateCurveFromDrag = (
  curve: Curve,
  dragTarget: DragTarget,
  nextPoint: Point,
  lockSibling: boolean,
) => {
  const nextCurve = cloneCurve(curve)

  if (dragTarget.kind === 'anchor') {
    if (dragTarget.index <= 0 || dragTarget.index >= nextCurve.anchors.length - 1) {
      return nextCurve
    }

    const currentAnchor = nextCurve.anchors[dragTarget.index]
    const previousX = nextCurve.anchors[dragTarget.index - 1].x + MIN_ANCHOR_GAP
    const nextX = nextCurve.anchors[dragTarget.index + 1].x - MIN_ANCHOR_GAP
    const clampedAnchor = point(clamp(nextPoint.x, previousX, nextX), nextPoint.y)
    const deltaX = clampedAnchor.x - currentAnchor.x
    const deltaY = clampedAnchor.y - currentAnchor.y

    nextCurve.anchors[dragTarget.index] = clampedAnchor
    nextCurve.segments[dragTarget.index - 1].cp2 = point(
      nextCurve.segments[dragTarget.index - 1].cp2.x + deltaX,
      nextCurve.segments[dragTarget.index - 1].cp2.y + deltaY,
    )
    nextCurve.segments[dragTarget.index].cp1 = point(
      nextCurve.segments[dragTarget.index].cp1.x + deltaX,
      nextCurve.segments[dragTarget.index].cp1.y + deltaY,
    )
  }

  if (dragTarget.kind === 'cp1') {
    const segment = nextCurve.segments[dragTarget.index]
    const startX = nextCurve.anchors[dragTarget.index].x
    const maxX = segment.cp2.x
    segment.cp1 = point(clamp(nextPoint.x, startX, maxX), nextPoint.y)

    if (lockSibling && dragTarget.index > 0) {
      const joint = nextCurve.anchors[dragTarget.index]
      const sibling = nextCurve.segments[dragTarget.index - 1]
      sibling.cp2 = point(
        clamp(2 * joint.x - segment.cp1.x, sibling.cp1.x, joint.x),
        2 * joint.y - segment.cp1.y,
      )
    }
  }

  if (dragTarget.kind === 'cp2') {
    const segment = nextCurve.segments[dragTarget.index]
    const minX = segment.cp1.x
    const endX = nextCurve.anchors[dragTarget.index + 1].x
    segment.cp2 = point(clamp(nextPoint.x, minX, endX), nextPoint.y)

    if (lockSibling && dragTarget.index < nextCurve.segments.length - 1) {
      const joint = nextCurve.anchors[dragTarget.index + 1]
      const sibling = nextCurve.segments[dragTarget.index + 1]
      sibling.cp1 = point(
        clamp(2 * joint.x - segment.cp2.x, joint.x, sibling.cp2.x),
        2 * joint.y - segment.cp2.y,
      )
    }
  }

  return normalizeCurve(nextCurve)
}

const getPreviewStyle = (mode: PreviewMode, value: number) => {
  const style: Record<string, string> = {
    opacity: '1',
    transform: 'translate3d(0, 0, 0)',
  }

  if (mode === 'move-x') {
    style.transform = `translate3d(${lerp(-88, 88, value)}px, 0, 0)`
  }

  if (mode === 'move-y') {
    style.transform = `translate3d(0, ${lerp(88, -88, value)}px, 0)`
  }

  if (mode === 'scale-x') {
    style.transform = `scaleX(${lerp(1, 1.9, value)})`
  }

  if (mode === 'scale-y') {
    style.transform = `scaleY(${lerp(1, 1.9, value)})`
  }

  if (mode === 'scale') {
    style.transform = `scale(${lerp(1, 1.72, value)})`
  }

  if (mode === 'rotate-z') {
    style.transform = `rotate(${value * 90}deg)`
  }

  if (mode === 'opacity') {
    style.opacity = `${lerp(1, 0, value)}`
  }

  if (mode === 'rotate-x') {
    style.transform = `perspective(720px) rotateX(${value * 180}deg)`
  }

  if (mode === 'rotate-y') {
    style.transform = `perspective(720px) rotateY(${value * 180}deg)`
  }

  return style
}

function App() {
  const [editorState, setEditorState] = createSignal<EditorState>(
    normalizeEditorState({
      curve: cloneCurve(PRESETS[1].curve),
      selectedSegment: 0,
    }),
  )
  const [past, setPast] = createSignal<EditorState[]>([])
  const [future, setFuture] = createSignal<EditorState[]>([])
  const [stopCount, setStopCount] = createSignal(24)
  const [samplingMode, setSamplingMode] = createSignal<SamplingMode>('smart')
  const [duration, setDuration] = createSignal(1100)
  const [previewMode, setPreviewMode] = createSignal<PreviewMode>('move-x')
  const [copyLabel, setCopyLabel] = createSignal('Copy CSS')
  const [clock, setClock] = createSignal(0)
  const [dragTarget, setDragTarget] = createSignal<DragTarget | null>(null)
  const [dragOrigin, setDragOrigin] = createSignal<EditorState | null>(null)
  const [shiftHeld, setShiftHeld] = createSignal(false)
  const [modHeld, setModHeld] = createSignal(false)

  let svgRef: SVGSVGElement | undefined
  let copyResetTimer: number | undefined
  let frameHandle = 0

  const curve = createMemo(() => editorState().curve)
  const selectedSegment = createMemo(() => editorState().selectedSegment)
  const canUndo = createMemo(() => past().length > 0)
  const canRedo = createMemo(() => future().length > 0)
  const exactPath = createMemo(() => buildCurvePath(curve()))
  const selectedPath = createMemo(() => buildSegmentPath(curve(), selectedSegment()))
  const segmentPaths = createMemo(() =>
    curve().segments.map((_, index) => buildSegmentPath(curve(), index)),
  )
  const linearStops = createMemo(() => sampleLinearStops(curve(), stopCount(), samplingMode()))
  const linearPath = createMemo(() => buildLinePath(linearStops()))
  const linearCss = createMemo(() => formatLinearFunction(linearStops()))
  const transitionCss = createMemo(
    () => `transition-timing-function: ${linearCss()};`,
  )
  const animationCss = createMemo(
    () => `animation-timing-function: ${linearCss()};`,
  )
  const previewProgress = createMemo(() => {
    const totalDuration = duration() * 2 + PREVIEW_HOLD * 2
    const elapsed = clock() % totalDuration

    if (elapsed <= duration()) {
      return elapsed / duration()
    }

    if (elapsed <= duration() + PREVIEW_HOLD) {
      return 1
    }

    if (elapsed <= duration() * 2 + PREVIEW_HOLD) {
      return (elapsed - duration() - PREVIEW_HOLD) / duration()
    }

    return 1
  })
  const previewLeg = createMemo<'forward' | 'backward'>(() => {
    const totalDuration = duration() * 2 + PREVIEW_HOLD * 2
    const elapsed = clock() % totalDuration

    if (elapsed <= duration() + PREVIEW_HOLD) {
      return 'forward'
    }

    return 'backward'
  })
  const previewValue = createMemo(() =>
    evaluateLinearStops(linearStops(), previewProgress()),
  )
  const previewAppliedValue = createMemo(() =>
    previewLeg() === 'forward' ? previewValue() : 1 - previewValue(),
  )
  const previewStyle = createMemo(() =>
    getPreviewStyle(previewMode(), previewAppliedValue()),
  )

  const selectSegment = (index: number) => {
    setEditorWithoutHistory({
      curve: curve(),
      selectedSegment: index,
    })
  }

  const commitEditorState = (nextState: EditorState) => {
    const current = editorState()
    const normalizedNext = normalizeEditorState(cloneEditorState(nextState))

    if (editorStatesEqual(current, normalizedNext)) {
      return
    }

    setPast((currentPast) => [...currentPast, cloneEditorState(current)])
    setEditorState(normalizedNext)
    setFuture([])
  }

  const setEditorWithoutHistory = (nextState: EditorState) => {
    setEditorState(normalizeEditorState(cloneEditorState(nextState)))
  }

  const undo = () => {
    const previous = past()[past().length - 1]

    if (!previous) {
      return
    }

    setPast((currentPast) => currentPast.slice(0, -1))
    setFuture((currentFuture) => [cloneEditorState(editorState()), ...currentFuture])
    setEditorState(cloneEditorState(previous))
    setDragTarget(null)
    setDragOrigin(null)
  }

  const redo = () => {
    const [next, ...rest] = future()

    if (!next) {
      return
    }

    setFuture(rest)
    setPast((currentPast) => [...currentPast, cloneEditorState(editorState())])
    setEditorState(cloneEditorState(next))
    setDragTarget(null)
    setDragOrigin(null)
  }

  createHotkeys(
    () => [
      {
        hotkey: 'Mod+Z',
        callback: () => undo(),
        options: { enabled: canUndo(), preventDefault: true },
      },
      {
        hotkey: 'Mod+Shift+Z',
        callback: () => redo(),
        options: { enabled: canRedo(), preventDefault: true },
      },
      {
        hotkey: 'Mod+C',
        callback: (event) => {
          if (!canUseGlobalCopyHotkey()) {
            return
          }

          event.preventDefault()
          void copyCss()
        },
      },
    ],
    () => ({ enabled: !dragTarget() }),
  )

  onMount(() => {
    let animationOrigin: number | undefined

    const syncModifierState = (event?: KeyboardEvent | MouseEvent) => {
      setShiftHeld(Boolean(event?.shiftKey))
      setModHeld(Boolean(event && ('metaKey' in event ? event.metaKey || event.ctrlKey : false)))
    }

    const tick = (time: number) => {
      if (animationOrigin === undefined) {
        animationOrigin = time
      }

      setClock(time - animationOrigin)
      frameHandle = window.requestAnimationFrame(tick)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const activeTarget = dragTarget()

      if (!activeTarget || !svgRef) {
        return
      }

      const nextPoint = clientPointToCurve(event.clientX, event.clientY, svgRef)
      setEditorWithoutHistory({
        curve: updateCurveFromDrag(curve(), activeTarget, nextPoint, event.shiftKey),
        selectedSegment: selectedSegment(),
      })
      syncModifierState(event)
    }

    const handlePointerUp = () => {
      const origin = dragOrigin()

      if (origin && !editorStatesEqual(origin, editorState())) {
        setPast((currentPast) => [...currentPast, cloneEditorState(origin)])
        setFuture([])
      }

      setDragOrigin(null)
      setDragTarget(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => syncModifierState(event)
    const handleKeyUp = (event: KeyboardEvent) => syncModifierState(event)
    const handleBlur = () => {
      setShiftHeld(false)
      setModHeld(false)
    }

    frameHandle = window.requestAnimationFrame(tick)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    onCleanup(() => {
      window.cancelAnimationFrame(frameHandle)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)

      if (copyResetTimer) {
        window.clearTimeout(copyResetTimer)
      }
    })
  })

  const applyPreset = (presetCurve: Curve) => {
    commitEditorState({ curve: cloneCurve(presetCurve), selectedSegment: 0 })
  }

  const startDrag = (target: DragTarget, event: PointerEvent) => {
    event.preventDefault()
    setDragOrigin(cloneEditorState(editorState()))
    setDragTarget(target)
    setShiftHeld(event.shiftKey)
    setModHeld(event.metaKey || event.ctrlKey)

    if (svgRef) {
      const nextPoint = clientPointToCurve(event.clientX, event.clientY, svgRef)
      setEditorWithoutHistory({
        curve: updateCurveFromDrag(curve(), target, nextPoint, event.shiftKey),
        selectedSegment: selectedSegment(),
      })
    }
  }

  const addSegment = () => {
    commitEditorState({
      curve: splitSegment(curve(), selectedSegment()),
      selectedSegment: selectedSegment(),
    })
  }

  const deleteSegment = () => {
    commitEditorState({
      curve: removeSegment(curve(), selectedSegment()),
      selectedSegment: Math.min(selectedSegment(), curve().segments.length - 2),
    })
  }

  const copyCss = async () => {
    try {
      const copied = await copyText(linearCss())

      if (!copied) {
        throw new Error('Copy failed')
      }

      setCopyLabel('Copied')
    } catch {
      setCopyLabel('Copy failed')
    }

    if (copyResetTimer) {
      window.clearTimeout(copyResetTimer)
    }

    copyResetTimer = window.setTimeout(() => setCopyLabel('Copy CSS'), 1400)
  }

  const canUseGlobalCopyHotkey = () => {
    const selection = window.getSelection()

    if (selection && selection.toString().trim().length > 0) {
      return false
    }

    const activeElement = document.activeElement as HTMLElement | null

    if (activeElement?.tagName === 'TEXTAREA' || activeElement?.isContentEditable) {
      return false
    }

    if (activeElement?.tagName === 'INPUT') {
      const input = activeElement as HTMLInputElement

      if (input.type !== 'range') {
        return false
      }
    }

    return true
  }

  const handleSegmentClick = (index: number, event: MouseEvent) => {
    if ((event.metaKey || event.ctrlKey) && svgRef) {
      const targetPoint = clientPointToCurve(event.clientX, event.clientY, svgRef)
      const splitT = findClosestTOnSegment(curve(), index, targetPoint)

      commitEditorState({
        curve: splitSegmentAt(curve(), index, splitT),
        selectedSegment: index,
      })

      return
    }

    selectSegment(index)
  }

  return (
    <main class="app-shell">
      <header class="title-bar">
        <h1>Bezier to linear easing editor</h1>
      </header>

      <section class="workspace-grid">
        <section class="panel editor-panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Curve</p>
              <h2>Exact editor</h2>
            </div>
            <div class="history-buttons">
              <button
                class="secondary-button"
                disabled={!canUndo()}
                onClick={undo}
                type="button"
              >
                Undo <span class="button-shortcut">{UNDO_HOTKEY_LABEL}</span>
              </button>
              <button
                class="secondary-button"
                disabled={!canRedo()}
                onClick={redo}
                type="button"
              >
                Redo <span class="button-shortcut">{REDO_HOTKEY_LABEL}</span>
              </button>
            </div>
          </div>

          <div class="control-row preset-row">
            <span>Presets</span>
            <div class="chip-group">
              <For each={PRESETS}>
                {(preset) => (
                  <button
                    class="chip-button"
                    onClick={() => applyPreset(preset.curve)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="control-row">
            <span>Segments</span>
            <div class="chip-group segment-group">
              <For each={curve().segments}>
                {(_, index) => (
                  <button
                    class={`segment-chip ${selectedSegment() === index() ? 'is-active' : ''}`}
                    onClick={() =>
                      setEditorWithoutHistory({
                        curve: curve(),
                        selectedSegment: index(),
                      })
                    }
                    type="button"
                  >
                    S{index() + 1}
                  </button>
                )}
              </For>
            </div>
            <div class="action-buttons">
              <button class="secondary-button" onClick={addSegment} type="button">
                Split selected
              </button>
              <button
                class="secondary-button"
                disabled={curve().segments.length === 1}
                onClick={deleteSegment}
                type="button"
              >
                Remove selected
              </button>
            </div>
          </div>

          <div class="modifier-bar">
            <div class={`modifier-pill ${shiftHeld() ? 'is-active' : ''}`}>
              <span class="modifier-shortcut">{SHIFT_LABEL}+Drag</span>
              <span>mirror handle</span>
            </div>
            <div class={`modifier-pill ${modHeld() ? 'is-active' : ''}`}>
              <span class="modifier-shortcut">{MOD_CLICK_LABEL}</span>
              <span>split at click</span>
            </div>
            <div class="modifier-pill">
              <span class="modifier-shortcut">Click curve</span>
              <span>select segment</span>
            </div>
          </div>

          <div class="editor-canvas-wrap">
            <svg
              aria-label="Bezier curve editor"
              class="editor-canvas"
              ref={svgRef}
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            >
              <defs>
                <linearGradient id="curve-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stop-color="#7c3aed" />
                  <stop offset="52%" stop-color="#38bdf8" />
                  <stop offset="100%" stop-color="#34d399" />
                </linearGradient>
                <filter id="curve-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur result="blur" stdDeviation="8" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <For each={Array.from({ length: 9 }, (_, index) => index / 8)}>
                {(ratio) => (
                  <line
                    class="grid-line"
                    x1={xToSvg(ratio)}
                    x2={xToSvg(ratio)}
                    y1={GRAPH_TOP}
                    y2={GRAPH_TOP + GRAPH_HEIGHT}
                  />
                )}
              </For>
              <For each={Array.from({ length: 7 }, (_, index) => index / 6)}>
                {(ratio) => {
                  const y = Y_MIN + (Y_MAX - Y_MIN) * ratio

                  return (
                    <line
                      class={`grid-line ${Math.abs(y) < 0.001 || Math.abs(y - 1) < 0.001 ? 'is-emphasis' : ''}`}
                      x1={GRAPH_LEFT}
                      x2={GRAPH_LEFT + GRAPH_WIDTH}
                      y1={yToSvg(y)}
                      y2={yToSvg(y)}
                    />
                  )
                }}
              </For>

              <For each={segmentPaths()}>
                {(path, index) => (
                  <path
                    class={`segment-hit-area ${selectedSegment() === index() ? 'is-active' : ''} ${modHeld() ? 'is-mod-armed' : ''}`}
                    d={path}
                    onClick={(event) => handleSegmentClick(index(), event)}
                  />
                )}
              </For>

              <path class="linear-path" d={linearPath()} />
              <path class="curve-path" d={exactPath()} />
              <path class="selected-path-glow" d={selectedPath()} filter="url(#curve-glow)" />
              <path class="selected-path" d={selectedPath()} />

              <For each={curve().segments}>
                {(segment, index) => {
                  const anchor = () => curve().anchors[index()]
                  const nextAnchor = () => curve().anchors[index() + 1]

                  return (
                    <>
                      <line
                        class={`handle-line ${selectedSegment() === index() ? 'is-active' : ''}`}
                        x1={xToSvg(anchor().x)}
                        x2={xToSvg(segment.cp1.x)}
                        y1={yToSvg(anchor().y)}
                        y2={yToSvg(segment.cp1.y)}
                      />
                      <line
                        class={`handle-line ${selectedSegment() === index() ? 'is-active' : ''}`}
                        x1={xToSvg(nextAnchor().x)}
                        x2={xToSvg(segment.cp2.x)}
                        y1={yToSvg(nextAnchor().y)}
                        y2={yToSvg(segment.cp2.y)}
                      />
                      <rect
                        class={`control-point ${selectedSegment() === index() ? 'is-active' : ''} ${shiftHeld() ? 'is-mirror-armed' : ''}`}
                        height="12"
                        onPointerDown={(event) => startDrag({ kind: 'cp1', index: index() }, event)}
                        width="12"
                        x={xToSvg(segment.cp1.x) - 6}
                        y={yToSvg(segment.cp1.y) - 6}
                      />
                      <rect
                        class={`control-point ${selectedSegment() === index() ? 'is-active' : ''} ${shiftHeld() ? 'is-mirror-armed' : ''}`}
                        height="12"
                        onPointerDown={(event) => startDrag({ kind: 'cp2', index: index() }, event)}
                        width="12"
                        x={xToSvg(segment.cp2.x) - 6}
                        y={yToSvg(segment.cp2.y) - 6}
                      />
                    </>
                  )
                }}
              </For>

              <For each={curve().anchors}>
                {(anchor, index) => (
                  <>
                    <circle
                      class={`anchor-point ${index() === 0 || index() === curve().anchors.length - 1 ? 'is-locked' : ''}`}
                      cx={xToSvg(anchor.x)}
                      cy={yToSvg(anchor.y)}
                      onPointerDown={(event) => startDrag({ kind: 'anchor', index: index() }, event)}
                      r={index() === 0 || index() === curve().anchors.length - 1 ? '8' : '9'}
                    />
                  </>
                )}
              </For>

              <text class="axis-label" x={GRAPH_LEFT} y={GRAPH_TOP - 12}>
                output
              </text>
              <text class="axis-label" x={GRAPH_LEFT + GRAPH_WIDTH - 64} y={GRAPH_TOP + GRAPH_HEIGHT + 28}>
                progress
              </text>
            </svg>
          </div>

          <div class="legend-row">
            <div class="legend-item">
              <span class="legend-swatch exact"></span>
              Exact bezier curve
            </div>
            <div class="legend-item">
              <span class="legend-swatch approx"></span>
              Exported `linear()` approximation
            </div>
          </div>
        </section>

        <section class="panel preview-panel">
            <div class="panel-heading compact">
              <div>
                <p class="panel-kicker">Preview</p>
                <h2>Animation</h2>
              </div>
            </div>

            <div class="mode-grid">
              <For each={PREVIEW_MODES}>
                {(mode) => (
                  <button
                    class={`mode-chip ${previewMode() === mode.id ? 'is-active' : ''}`}
                    onClick={() => setPreviewMode(mode.id)}
                    type="button"
                  >
                    {mode.label}
                  </button>
                )}
              </For>
            </div>

            <div class="preview-stage">
              <div class="preview-guides horizontal"></div>
              <div class="preview-guides vertical"></div>
              <div class="preview-object-wrap">
                <div class="preview-card" style={previewStyle()}>
                </div>
              </div>
            </div>

            <div class="preview-stats compact-grid">
              <div>
                <span>t</span>
                <strong>{formatNumber(previewProgress(), 3)}</strong>
              </div>
              <div>
                <span>linear(t)</span>
                <strong>{formatNumber(previewValue(), 3)}</strong>
              </div>
            </div>

            <label class="slider-block" for="duration-slider">
              <div class="slider-copy">
                <span>Preview duration</span>
                <div class="slider-input-row">
                  <strong>{duration()}ms</strong>
                  <input
                    class="number-input"
                    max="2200"
                    min="300"
                    onInput={(event) =>
                      setDuration(clamp(Number(event.currentTarget.value || 0), 300, 2200))
                    }
                    step="10"
                    type="number"
                    value={duration()}
                  />
                </div>
              </div>
              <input
                id="duration-slider"
                max="2200"
                min="300"
                onInput={(event) => setDuration(Number(event.currentTarget.value))}
                type="range"
                value={duration()}
              />
            </label>

            <p class="preview-note">
              Plays forward, holds {PREVIEW_HOLD}ms, plays backward, holds {PREVIEW_HOLD}ms.
            </p>
          </section>

          <section class="panel output-panel">
          <div class="panel-heading compact">
            <div>
              <p class="panel-kicker">Export</p>
              <h2>CSS `linear()` easing</h2>
            </div>
            <button class="primary-button" onClick={copyCss} type="button">
              {copyLabel()} <span class="button-shortcut">{COPY_HOTKEY_LABEL}</span>
            </button>
          </div>

          <div class="control-row">
            <div class="chip-group sampling-group">
              <For each={SAMPLING_MODES}>
                {(mode) => (
                  <button
                    class={`segment-chip sampling-chip ${samplingMode() === mode.id ? 'is-active' : ''}`}
                    onClick={() => setSamplingMode(mode.id)}
                    type="button"
                  >
                    <span class="sampling-chip-label">{mode.label}</span>
                    <span class="sampling-chip-note">{mode.note}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <label class="slider-block" for="stop-slider">
            <div class="slider-copy">
              <span>{samplingMode() === 'smart' ? 'Stops / max budget' : 'Stops / accuracy'}</span>
              <strong>
                {samplingMode() === 'smart' && linearStops().length !== stopCount()
                  ? `${linearStops().length} / ${stopCount()}`
                  : `${stopCount()}`}
              </strong>
            </div>
            <input
              id="stop-slider"
              max="64"
              min="8"
              onInput={(event) => setStopCount(Number(event.currentTarget.value))}
              type="range"
              value={stopCount()}
            />
          </label>

          <pre class="code-block"><code innerHTML={highlightCss(linearCss())} /></pre>

          <div class="inline-code-list">
            <pre class="inline-code"><code innerHTML={highlightCss(transitionCss())} /></pre>
            <pre class="inline-code"><code innerHTML={highlightCss(animationCss())} /></pre>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
