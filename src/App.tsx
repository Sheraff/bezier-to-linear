import { createHotkeys, formatForDisplay } from '@tanstack/solid-hotkeys'
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import './App.css'
import cherryLogo from './assets/Cherry.svg'
import kailhLogo from './assets/Kailh.svg'
import dropLogo from './assets/drop.svg'
import topreLogo from './assets/Realforce.svg'
import ibmLogo from './assets/IBM.svg'
import alpsLogo from './assets/Alps.svg'
import gateronLogo from './assets/Gateron.svg'
import zealLogo from './assets/Zeal.svg'

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

type PresetCategory = 'standard' | 'switches' | 'devices' | 'dualsense'

const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  standard: 'Standard',
  switches: 'Keyboard switches',
  devices: 'Mechanical devices',
  dualsense: 'DualSense adaptive triggers',
}

const PRESET_CATEGORY_ICONS: Record<PresetCategory, JSX.Element> = {
  standard: (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <g fill="none" fill-rule="evenodd">
        <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
        <path fill="currentColor" d="M13 3a1 1 0 1 0-2 0v.5a1 1 0 1 0 2 0zm-8.5 9a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h.5a1 1 0 0 1 1 1M22 12a1 1 0 0 1-1 1h-.5a1 1 0 1 1 0-2h.5a1 1 0 0 1 1 1m-10 7.5a1 1 0 0 1 1 1v.5a1 1 0 1 1-2 0v-.5a1 1 0 0 1 1-1m7.778-13.864a1 1 0 0 0-1.414-1.414l-2.121 2.12a1 1 0 1 0 1.414 1.415zM7.758 16.243a1 1 0 0 1 0 1.414L5.635 19.78a1 1 0 0 1-1.414-1.415l2.121-2.12a1 1 0 0 1 1.414 0M5.635 4.222a1 1 0 0 0-1.414 1.414l2.12 2.121a1 1 0 0 0 1.415-1.414zm10.607 12.021a1 1 0 0 1 1.414 0l2.121 2.121a1 1 0 1 1-1.414 1.415l-2.121-2.122a1 1 0 0 1 0-1.414M12.948 6.14a1 1 0 0 0-1.888 0a8.02 8.02 0 0 1-4.92 4.92a1 1 0 0 0 0 1.888a8.03 8.03 0 0 1 4.92 4.92a1 1 0 0 0 1.888 0a8.03 8.03 0 0 1 4.92-4.92a1 1 0 0 0 0-1.888a8.03 8.03 0 0 1-4.92-4.92m-.944 9.094a10.05 10.05 0 0 0-3.23-3.23a10.05 10.05 0 0 0 3.23-3.23a10.05 10.05 0 0 0 3.23 3.23a10.05 10.05 0 0 0-3.23 3.23" />
      </g>
    </svg>
  ),
  switches: (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <g fill="none" fill-rule="evenodd">
        <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
        <path fill="currentColor" fill-rule="nonzero" d="M18 3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-2.707 13.708A3 3 0 0 1 14 17H5v1a1 1 0 0 0 1 1h11.586zM18 5h-1v9c0 .463-.105.902-.292 1.293L19 17.586V6a1 1 0 0 0-1-1M9 7a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-.132l1.445.964a1 1 0 0 0 1.11-1.664l-1.377-.918l1.377-.918a1 1 0 0 0-1.11-1.664L10 8.63V8a1 1 0 0 0-1-1" />
      </g>
    </svg>
  ),
  devices: (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <g fill="none" fill-rule="evenodd">
        <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
        <path fill="currentColor" d="M12 2a1 1 0 0 1 .993.883L13 3v2.17a3 3 0 0 1 1.093 4.98l-.144.131l1.834 4.77a8 8 0 0 0 2.18-1.718a1 1 0 1 1 1.49 1.334a10 10 0 0 1-2.578 2.066l-.37.197l1.428 3.711a1 1 0 0 1-1.818.824l-.048-.106l-1.428-3.711a10.05 10.05 0 0 1-4.915.092l-.363-.092l-1.428 3.711a1 1 0 0 1-1.902-.607l.036-.111l3.984-10.36a3 3 0 0 1 .776-5.043L11 5.17V3a1 1 0 0 1 1-1m1.917 13.77l-1.835-4.771L12 11l-.082-.001l-1.835 4.77A8 8 0 0 0 12 16c.66 0 1.303-.08 1.917-.23M12 7a1 1 0 1 0 0 2a1 1 0 0 0 0-2" />
      </g>
    </svg>
  ),
  dualsense: (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <g fill="none">
        <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
        <path fill="currentColor" d="M17 4c1.106 0 1.955.843 2.584 1.75l.213.321l.195.32q.093.157.178.308c.787 1.407 1.472 3.244 1.925 5.059c.45 1.801.699 3.682.54 5.161C22.475 18.404 21.71 20 20 20c-1.534 0-2.743-.82-3.725-1.621l-1.11-.931C14.242 16.692 13.232 16 12 16s-2.243.692-3.164 1.448l-1.11.93C6.742 19.18 5.533 20 4 20c-1.711 0-2.476-1.596-2.635-3.081c-.158-1.48.09-3.36.54-5.161c.453-1.815 1.138-3.652 1.925-5.059l.178-.309l.195-.319l.213-.321C5.045 4.843 5.894 4 7 4c.51 0 1.017.124 1.515.27l.593.182q.147.045.292.086c.865.248 1.75.462 2.6.462s1.735-.214 2.6-.462l.885-.267C15.983 4.124 16.49 4 17 4M8.5 8a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5m7 0a1 1 0 0 0-1 1v.5H14a1 1 0 1 0 0 2h.5v.5a1 1 0 1 0 2 0v-.5h.5a1 1 0 1 0 0-2h-.5V9a1 1 0 0 0-1-1m-7 2a.5.5 0 1 1 0 1a.5.5 0 0 1 0-1" />
      </g>
    </svg>
  ),
}

const PRESET_CATEGORIES: PresetCategory[] = ['standard', 'switches', 'devices', 'dualsense']

const PRESETS: Array<{ label: string; curve: Curve; category: PresetCategory; brand?: string; logo?: string; darkLogo?: boolean }> = [
  {
    label: 'Ease in',
    category: 'standard',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.5, 0), cp2: point(0.75, 0) }],
    },
  },
  {
    label: 'Exponential ease-in',
    category: 'standard',
    curve: {
      anchors: [
        point(0, 0), point(0.25, 0.1015), point(0.5, 0.2689),
        point(0.75, 0.5449), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0833, 0.0261), cp2: point(0.1667, 0.0585) },
        { cp1: point(0.3333, 0.1445), cp2: point(0.4167, 0.198) },
        { cp1: point(0.5833, 0.3399), cp2: point(0.6667, 0.428) },
        { cp1: point(0.8333, 0.6619), cp2: point(0.9167, 0.8072) },
      ],
    },
  },
  {
    label: 'Ease out',
    category: 'standard',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.25, 1), cp2: point(0.5, 1) }],
    },
  },
  {
    label: 'Exponential ease-out',
    category: 'standard',
    curve: {
      anchors: [
        point(0, 0), point(0.25, 0.4551), point(0.5, 0.7311),
        point(0.75, 0.8985), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0833, 0.1928), cp2: point(0.1667, 0.3381) },
        { cp1: point(0.3333, 0.572), cp2: point(0.4167, 0.6601) },
        { cp1: point(0.5833, 0.802), cp2: point(0.6667, 0.8555) },
        { cp1: point(0.8333, 0.9415), cp2: point(0.9167, 0.9739) },
      ],
    },
  },
  {
    label: 'Ease in-out',
    category: 'standard',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.44, 0), cp2: point(0.56, 1) }],
    },
  },
  {
    label: 'Exponential ease-in-out',
    category: 'standard',
    curve: {
      anchors: [
        point(0, 0), point(0.125, 0.0508), point(0.25, 0.1345), point(0.375, 0.2725),
        point(0.5, 0.5), point(0.625, 0.7275), point(0.75, 0.8655), point(0.875, 0.9492),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0417, 0.013), cp2: point(0.0833, 0.0293) },
        { cp1: point(0.1667, 0.0723), cp2: point(0.2083, 0.099) },
        { cp1: point(0.2917, 0.1699), cp2: point(0.3333, 0.214) },
        { cp1: point(0.4167, 0.3309), cp2: point(0.4583, 0.4036) },
        { cp1: point(0.5417, 0.5964), cp2: point(0.5833, 0.6691) },
        { cp1: point(0.6667, 0.786), cp2: point(0.7083, 0.8301) },
        { cp1: point(0.7917, 0.901), cp2: point(0.8333, 0.9277) },
        { cp1: point(0.9167, 0.9707), cp2: point(0.9583, 0.987) },
      ],
    },
  },
  {
    label: 'Overshoot',
    category: 'standard',
    curve: {
      anchors: [point(0, 0), point(0.48, 1.28), point(1, 1)],
      segments: [
        { cp1: point(0.06, 0.72), cp2: point(0.30, 1.30) },
        { cp1: point(0.64, 1.26), cp2: point(0.84, 1) },
      ],
    },
  },
  {
    label: 'Bounce',
    category: 'standard',
    curve: {
      anchors: [
        point(0, 0), point(0.35, 1), point(0.6517, 1),
        point(0.8651, 1), point(1, 1),
      ],
      segments: [
        { cp1: point(0.1167, 0), cp2: point(0.2333, 0.3333) },
        { cp1: point(0.4753, 0.6981), cp2: point(0.5468, 0.7257) },
        { cp1: point(0.7421, 0.8168), cp2: point(0.7687, 0.8196) },
        { cp1: point(0.9088, 0.9216), cp2: point(0.958, 0.9089) },
      ],
    },
  },
  {
    label: 'Spring',
    category: 'standard',
    curve: {
      anchors: [
        point(0, 0), point(0.079, 1.689), point(0.161, 0.5287),
        point(0.2435, 1.3224), point(0.3255, 0.7795),
        point(0.408, 1.1509), point(0.49, 0.8968),
        point(0.572, 1.0706), point(0.6545, 0.9517),
        point(0.7365, 1.033), point(0.819, 0.9774),
        point(0.901, 1.0155), point(0.983, 0.9894), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0239, 0.1067), cp2: point(0.0527, 1.7717) },
        { cp1: point(0.1063, 1.6551), cp2: point(0.1337, 0.4859) },
        { cp1: point(0.1868, 0.5461), cp2: point(0.2159, 1.3369) },
        { cp1: point(0.2708, 1.2931), cp2: point(0.2982, 0.7795) },
        { cp1: point(0.353, 0.7868), cp2: point(0.3805, 1.1509) },
        { cp1: point(0.4353, 1.1509), cp2: point(0.4627, 0.8968) },
        { cp1: point(0.5173, 0.8968), cp2: point(0.5447, 1.0706) },
        { cp1: point(0.5995, 1.0706), cp2: point(0.627, 0.9517) },
        { cp1: point(0.6818, 0.9517), cp2: point(0.7092, 1.033) },
        { cp1: point(0.764, 1.033), cp2: point(0.7915, 0.9774) },
        { cp1: point(0.8463, 0.9774), cp2: point(0.8737, 1.0155) },
        { cp1: point(0.9283, 1.0155), cp2: point(0.9557, 0.9894) },
        { cp1: point(0.9887, 0.9894), cp2: point(0.9943, 1) },
      ],
    },
  },
  {
    label: 'Click',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.5996, 0.7013), point(0.792, 0.7988),
        point(0.8785, 1.0521), point(1, 1),
      ],
      segments: [
        { cp1: point(0.2402, 0.037), cp2: point(0.4232, 0.4647) },
        { cp1: point(0.6722, 0.8006), cp2: point(0.6896, 0.7988) },
        { cp1: point(0.812, 0.9388), cp2: point(0.8385, 1.0521) },
        { cp1: point(0.9185, 1.0521), cp2: point(0.9543, 0.9008) },
      ],
    },
  },
  {
    label: 'MX Brown',
    category: 'switches',
    brand: 'Cherry',
    logo: cherryLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0136, 0.1112), point(0.0346, 0.2222),
        point(0.0714, 0.3333), point(0.1493, 0.4445), point(0.2906, 0.5555),
        point(0.3251, 0.6667), point(0.3682, 0.7778), point(0.4728, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0045, 0.0445), cp2: point(0.009, 0.0807) },
        { cp1: point(0.0206, 0.1573), cp2: point(0.0276, 0.1931) },
        { cp1: point(0.0469, 0.2712), cp2: point(0.0591, 0.3062) },
        { cp1: point(0.0973, 0.3877), cp2: point(0.1233, 0.4208) },
        { cp1: point(0.1964, 0.4807), cp2: point(0.2435, 0.5004) },
        { cp1: point(0.3021, 0.5755), cp2: point(0.3136, 0.6145) },
        { cp1: point(0.3395, 0.7176), cp2: point(0.3538, 0.752) },
        { cp1: point(0.403, 0.8362), cp2: point(0.4379, 0.8675) },
        { cp1: point(0.6486, 0.9732), cp2: point(0.8243, 0.9884) },
      ],
    },
  },
  {
    label: 'MX Blue',
    category: 'switches',
    brand: 'Cherry',
    logo: cherryLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0128, 0.1112), point(0.0372, 0.2222),
        point(0.1006, 0.3333), point(0.5042, 0.4445), point(0.7659, 0.5555),
        point(0.7817, 0.6667), point(0.8074, 0.7778), point(0.8584, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0043, 0.0477), cp2: point(0.0085, 0.0831) },
        { cp1: point(0.0209, 0.1627), cp2: point(0.0291, 0.1968) },
        { cp1: point(0.0584, 0.2825), cp2: point(0.0795, 0.3129) },
        { cp1: point(0.2351, 0.4273), cp2: point(0.3697, 0.435) },
        { cp1: point(0.5914, 0.4532), cp2: point(0.6787, 0.4093) },
        { cp1: point(0.7712, 0.5965), cp2: point(0.7765, 0.6359) },
        { cp1: point(0.7903, 0.7148), cp2: point(0.7989, 0.7501) },
        { cp1: point(0.8244, 0.8302), cp2: point(0.8414, 0.864) },
        { cp1: point(0.9056, 0.9514), cp2: point(0.9528, 0.9807) },
      ],
    },
  },
  {
    label: 'Box Jade',
    category: 'switches',
    brand: 'Kailh',
    logo: kailhLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0072, 0.1112), point(0.0212, 0.2222),
        point(0.059, 0.3333), point(0.3498, 0.4445), point(0.5187, 0.5555),
        point(0.5285, 0.6667), point(0.5536, 0.7778), point(0.6943, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0024, 0.0479), cp2: point(0.0048, 0.0833) },
        { cp1: point(0.0119, 0.1632), cp2: point(0.0166, 0.1971) },
        { cp1: point(0.0338, 0.2837), cp2: point(0.0464, 0.3135) },
        { cp1: point(0.1559, 0.4352), cp2: point(0.2529, 0.4363) },
        { cp1: point(0.4061, 0.4568), cp2: point(0.4624, 0.4033) },
        { cp1: point(0.5219, 0.607), cp2: point(0.5252, 0.6412) },
        { cp1: point(0.5368, 0.7266), cp2: point(0.5452, 0.7572) },
        { cp1: point(0.6005, 0.8643), cp2: point(0.6474, 0.8759) },
        { cp1: point(0.7962, 0.9259), cp2: point(0.8981, 0.9629) },
      ],
    },
  },
  {
    label: 'Holy Panda',
    category: 'switches',
    brand: 'Drop',
    logo: dropLogo,
    darkLogo: true,
    curve: {
      anchors: [
        point(0, 0), point(0.0104, 0.1112), point(0.0353, 0.2222),
        point(0.1513, 0.3333), point(0.6497, 0.4445), point(0.6721, 0.5555),
        point(0.6962, 0.6667), point(0.7367, 0.7778), point(0.8166, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0035, 0.0506), cp2: point(0.0069, 0.0851) },
        { cp1: point(0.0187, 0.1689), cp2: point(0.027, 0.2005) },
        { cp1: point(0.0739, 0.3035), cp2: point(0.1126, 0.3209) },
        { cp1: point(0.3174, 0.3663), cp2: point(0.4836, 0.3552) },
        { cp1: point(0.6572, 0.4621), cp2: point(0.6647, 0.5034) },
        { cp1: point(0.6802, 0.6011), cp2: point(0.6882, 0.6371) },
        { cp1: point(0.7097, 0.7147), cp2: point(0.7232, 0.7501) },
        { cp1: point(0.7634, 0.8301), cp2: point(0.79, 0.864) },
        { cp1: point(0.8777, 0.9397), cp2: point(0.9389, 0.9701) },
      ],
    },
  },
  {
    label: 'Topre',
    category: 'switches',
    brand: 'Realforce',
    logo: topreLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0178, 0.1112), point(0.486, 0.2222),
        point(0.9408, 0.3333), point(0.9628, 0.4445), point(0.9703, 0.5555),
        point(0.9765, 0.6667), point(0.9833, 0.7778), point(0.991, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0059, 0.0806), cp2: point(0.0119, 0.0986) },
        { cp1: point(0.1739, 0.2214), cp2: point(0.33, 0.2101) },
        { cp1: point(0.6376, 0.2339), cp2: point(0.7892, 0.2237) },
        { cp1: point(0.9481, 0.3476), cp2: point(0.9555, 0.3709) },
        { cp1: point(0.9653, 0.4737), cp2: point(0.9678, 0.5111) },
        { cp1: point(0.9723, 0.5926), cp2: point(0.9744, 0.6301) },
        { cp1: point(0.9788, 0.7059), cp2: point(0.981, 0.7429) },
        { cp1: point(0.9859, 0.8174), cp2: point(0.9885, 0.8543) },
        { cp1: point(0.994, 0.9286), cp2: point(0.997, 0.9655) },
      ],
    },
  },
  {
    label: 'Buckling Spring',
    category: 'switches',
    brand: 'IBM',
    logo: ibmLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0103, 0.1112), point(0.0288, 0.2222),
        point(0.0697, 0.3333), point(0.2203, 0.4445), point(0.754, 0.5555),
        point(0.7673, 0.6667), point(0.7934, 0.7778), point(0.8721, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0034, 0.0466), cp2: point(0.0069, 0.0823) },
        { cp1: point(0.0165, 0.1607), cp2: point(0.0226, 0.1955) },
        { cp1: point(0.0424, 0.2778), cp2: point(0.0561, 0.3104) },
        { cp1: point(0.1199, 0.4057), cp2: point(0.1701, 0.4292) },
        { cp1: point(0.3982, 0.4821), cp2: point(0.5761, 0.4841) },
        { cp1: point(0.7584, 0.5959), cp2: point(0.7629, 0.6374) },
        { cp1: point(0.776, 0.7204), cp2: point(0.7847, 0.7538) },
        { cp1: point(0.8197, 0.8423), cp2: point(0.8459, 0.8694) },
        { cp1: point(0.9147, 0.9259), cp2: point(0.9574, 0.9629) },
      ],
    },
  },
  {
    label: 'Alps Orange',
    category: 'switches',
    brand: 'Alps',
    logo: alpsLogo,
    darkLogo: true,
    curve: {
      anchors: [
        point(0, 0), point(0.0071, 0.1112), point(0.0214, 0.2222),
        point(0.1501, 0.3333), point(0.8712, 0.4445), point(0.9559, 0.5555),
        point(0.9709, 0.6667), point(0.9806, 0.7778), point(0.99, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0024, 0.0425), cp2: point(0.0047, 0.0798) },
        { cp1: point(0.0119, 0.1705), cp2: point(0.0166, 0.2023) },
        { cp1: point(0.0643, 0.3249), cp2: point(0.1072, 0.3236) },
        { cp1: point(0.3905, 0.3714), cp2: point(0.6308, 0.389) },
        { cp1: point(0.8994, 0.4551), cp2: point(0.9277, 0.4632) },
        { cp1: point(0.9609, 0.5792), cp2: point(0.9659, 0.6145) },
        { cp1: point(0.9742, 0.7011), cp2: point(0.9774, 0.7388) },
        { cp1: point(0.9838, 0.8155), cp2: point(0.9869, 0.8526) },
        { cp1: point(0.9934, 0.9271), cp2: point(0.9967, 0.9641) },
      ],
    },
  },
  {
    label: 'MX Red',
    category: 'switches',
    brand: 'Cherry',
    logo: cherryLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0193, 0.1112), point(0.0433, 0.2222),
        point(0.0738, 0.3333), point(0.1139, 0.4445), point(0.1684, 0.5555),
        point(0.2467, 0.6667), point(0.3673, 0.7778), point(0.574, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0064, 0.0408), cp2: point(0.0129, 0.0776) },
        { cp1: point(0.0273, 0.1523), cp2: point(0.0353, 0.189) },
        { cp1: point(0.0535, 0.2639), cp2: point(0.0637, 0.3006) },
        { cp1: point(0.0872, 0.3757), cp2: point(0.1006, 0.4123) },
        { cp1: point(0.1321, 0.4876), cp2: point(0.1503, 0.524) },
        { cp1: point(0.1945, 0.5998), cp2: point(0.2206, 0.6361) },
        { cp1: point(0.2869, 0.7126), cp2: point(0.3271, 0.7485) },
        { cp1: point(0.4362, 0.8264), cp2: point(0.5051, 0.8615) },
        { cp1: point(0.716, 0.9423), cp2: point(0.858, 0.9758) },
      ],
    },
  },
  {
    label: 'MX Clear',
    category: 'switches',
    brand: 'Cherry',
    logo: cherryLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0067, 0.1112), point(0.0183, 0.2222),
        point(0.0434, 0.3333), point(0.1278, 0.4445), point(0.4603, 0.5555),
        point(0.5013, 0.6667), point(0.5447, 0.7778), point(0.641, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0022, 0.0463), cp2: point(0.0044, 0.0821) },
        { cp1: point(0.0105, 0.1603), cp2: point(0.0144, 0.1952) },
        { cp1: point(0.0267, 0.2769), cp2: point(0.035, 0.3098) },
        { cp1: point(0.0715, 0.4025), cp2: point(0.0997, 0.428) },
        { cp1: point(0.2386, 0.4891), cp2: point(0.3495, 0.4953) },
        { cp1: point(0.4739, 0.5708), cp2: point(0.4876, 0.606) },
        { cp1: point(0.5157, 0.7163), cp2: point(0.5302, 0.7512) },
        { cp1: point(0.5768, 0.8335), cp2: point(0.6089, 0.866) },
        { cp1: point(0.7607, 0.9616), cp2: point(0.8803, 0.9849) },
      ],
    },
  },
  {
    label: 'Zilent',
    category: 'switches',
    brand: 'Zeal',
    logo: zealLogo,
    darkLogo: true,
    curve: {
      anchors: [
        point(0, 0), point(0.0056, 0.1112), point(0.0126, 0.2222),
        point(0.0276, 0.3333), point(0.1374, 0.4445), point(0.8304, 0.5555),
        point(0.966, 0.6667), point(0.9841, 0.7778), point(0.9928, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0019, 0.0388), cp2: point(0.0037, 0.0761) },
        { cp1: point(0.008, 0.1549), cp2: point(0.0103, 0.192) },
        { cp1: point(0.0176, 0.282), cp2: point(0.0226, 0.3134) },
        { cp1: point(0.0642, 0.4281), cp2: point(0.1008, 0.4337) },
        { cp1: point(0.3684, 0.4926), cp2: point(0.5994, 0.5139) },
        { cp1: point(0.8756, 0.5664), cp2: point(0.9208, 0.5715) },
        { cp1: point(0.972, 0.6866), cp2: point(0.9781, 0.718) },
        { cp1: point(0.987, 0.8086), cp2: point(0.9899, 0.8458) },
        { cp1: point(0.9952, 0.9248), cp2: point(0.9976, 0.9622) },
      ],
    },
  },
  {
    label: 'Box Navy',
    category: 'switches',
    brand: 'Kailh',
    logo: kailhLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.009, 0.1112), point(0.0266, 0.2222),
        point(0.0745, 0.3333), point(0.46, 0.4445), point(0.6803, 0.5555),
        point(0.6908, 0.6667), point(0.7151, 0.7778), point(0.8143, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.003, 0.048), cp2: point(0.006, 0.0833) },
        { cp1: point(0.0149, 0.1633), cp2: point(0.0208, 0.1972) },
        { cp1: point(0.0426, 0.284), cp2: point(0.0585, 0.3136) },
        { cp1: point(0.203, 0.4372), cp2: point(0.3315, 0.4365) },
        { cp1: point(0.5334, 0.4579), cp2: point(0.6069, 0.4044) },
        { cp1: point(0.6838, 0.6058), cp2: point(0.6873, 0.6404) },
        { cp1: point(0.6989, 0.7237), cp2: point(0.707, 0.7557) },
        { cp1: point(0.7482, 0.8525), cp2: point(0.7812, 0.873) },
        { cp1: point(0.8762, 0.9259), cp2: point(0.9381, 0.9629) },
      ],
    },
  },
  {
    label: 'Cream',
    category: 'switches',
    brand: 'NovelKeys',
    curve: {
      anchors: [
        point(0, 0), point(0.0353, 0.1112), point(0.072, 0.2222),
        point(0.1102, 0.3333), point(0.1501, 0.4445), point(0.1917, 0.5555),
        point(0.2352, 0.6667), point(0.2806, 0.7778), point(0.3281, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0118, 0.0378), cp2: point(0.0235, 0.0748) },
        { cp1: point(0.0475, 0.1489), cp2: point(0.0597, 0.1859) },
        { cp1: point(0.0847, 0.26), cp2: point(0.0975, 0.297) },
        { cp1: point(0.1235, 0.3711), cp2: point(0.1368, 0.4082) },
        { cp1: point(0.164, 0.4823), cp2: point(0.1778, 0.5193) },
        { cp1: point(0.2062, 0.5933), cp2: point(0.2207, 0.6304) },
        { cp1: point(0.2503, 0.7045), cp2: point(0.2655, 0.7416) },
        { cp1: point(0.2964, 0.8156), cp2: point(0.3123, 0.8526) },
        { cp1: point(0.5521, 1.0421), cp2: point(0.776, 0.9918) },
      ],
    },
  },
  {
    label: 'Hako True',
    category: 'switches',
    brand: 'Input Club',
    curve: {
      anchors: [
        point(0, 0), point(0.0144, 0.1112), point(0.0295, 0.2222),
        point(0.0458, 0.3333), point(0.0645, 0.4445), point(0.0875, 0.5555),
        point(0.1188, 0.6667), point(0.1692, 0.7778), point(0.2813, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0048, 0.0376), cp2: point(0.0096, 0.0747) },
        { cp1: point(0.0194, 0.1492), cp2: point(0.0245, 0.1863) },
        { cp1: point(0.0349, 0.261), cp2: point(0.0404, 0.2981) },
        { cp1: point(0.0521, 0.3733), cp2: point(0.0583, 0.4103) },
        { cp1: point(0.0722, 0.4859), cp2: point(0.0798, 0.5228) },
        { cp1: point(0.0979, 0.5994), cp2: point(0.1083, 0.6359) },
        { cp1: point(0.1356, 0.7147), cp2: point(0.1524, 0.7503) },
        { cp1: point(0.2066, 0.8351), cp2: point(0.2439, 0.8672) },
        { cp1: point(0.5208, 0.9871), cp2: point(0.7604, 0.9916) },
      ],
    },
  },
  {
    label: 'Speed Silver',
    category: 'switches',
    brand: 'Cherry',
    logo: cherryLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.0147, 0.1112), point(0.0333, 0.2222),
        point(0.0572, 0.3333), point(0.0893, 0.4445), point(0.1341, 0.5555),
        point(0.2006, 0.6667), point(0.3087, 0.7778), point(0.5102, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0049, 0.041), cp2: point(0.0098, 0.0778) },
        { cp1: point(0.0209, 0.1526), cp2: point(0.0271, 0.1893) },
        { cp1: point(0.0413, 0.2642), cp2: point(0.0493, 0.3009) },
        { cp1: point(0.0679, 0.3761), cp2: point(0.0786, 0.4126) },
        { cp1: point(0.1042, 0.4882), cp2: point(0.1191, 0.5245) },
        { cp1: point(0.1562, 0.6006), cp2: point(0.1784, 0.6367) },
        { cp1: point(0.2367, 0.7139), cp2: point(0.2727, 0.7495) },
        { cp1: point(0.3759, 0.8286), cp2: point(0.443, 0.863) },
        { cp1: point(0.6735, 0.9472), cp2: point(0.8367, 0.9786) },
      ],
    },
  },
  {
    label: 'Ink Black',
    category: 'switches',
    brand: 'Gateron',
    logo: gateronLogo,
    curve: {
      anchors: [
        point(0, 0), point(0.031, 0.1112), point(0.0684, 0.2222),
        point(0.1142, 0.3333), point(0.1718, 0.4445), point(0.2456, 0.5555),
        point(0.344, 0.6667), point(0.4803, 0.7778), point(0.6803, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0103, 0.0403), cp2: point(0.0207, 0.0772) },
        { cp1: point(0.0435, 0.1517), cp2: point(0.0559, 0.1885) },
        { cp1: point(0.0837, 0.2631), cp2: point(0.0989, 0.2999) },
        { cp1: point(0.1334, 0.3747), cp2: point(0.1526, 0.4115) },
        { cp1: point(0.1964, 0.4864), cp2: point(0.221, 0.523) },
        { cp1: point(0.2784, 0.5981), cp2: point(0.3112, 0.6347) },
        { cp1: point(0.3894, 0.7102), cp2: point(0.4349, 0.7466) },
        { cp1: point(0.547, 0.8226), cp2: point(0.6137, 0.8587) },
        { cp1: point(0.7869, 0.9357), cp2: point(0.8934, 0.9713) },
      ],
    },
  },
  {
    label: 'Toggle Switch',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.0503, 0.4445), point(0.9468, 0.5555), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0019, 0.1658), cp2: point(0.007, 0.4391) },
        { cp1: point(0.3491, 0.4994), cp2: point(0.648, 0.5006) },
        { cp1: point(0.9889, 0.5442), cp2: point(0.9997, 0.9171) },
      ],
    },
  },
  {
    label: 'Bow Release',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.48, -0.18), point(0.58, -0.18),
        point(0.68, 1.1), point(0.82, 0.96), point(0.92, 1.02),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.24, 0), cp2: point(0.42, -0.18) },
        { cp1: point(0.52, -0.18), cp2: point(0.55, -0.18) },
        { cp1: point(0.6, -0.18), cp2: point(0.64, 1.1) },
        { cp1: point(0.72, 1.1), cp2: point(0.78, 0.96) },
        { cp1: point(0.85, 0.96), cp2: point(0.89, 1.02) },
        { cp1: point(0.95, 1.02), cp2: point(0.98, 1) },
      ],
    },
  },
  {
    label: 'Pen Click',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.3, 0.35), point(0.38, 0.92),
        point(0.48, 1.05), point(0.58, 0.97), point(0.72, 1.01),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.12, 0.22), cp2: point(0.24, 0.35) },
        { cp1: point(0.32, 0.4), cp2: point(0.35, 0.92) },
        { cp1: point(0.41, 0.92), cp2: point(0.45, 1.05) },
        { cp1: point(0.51, 1.05), cp2: point(0.55, 0.97) },
        { cp1: point(0.62, 0.97), cp2: point(0.68, 1.01) },
        { cp1: point(0.78, 1.01), cp2: point(0.88, 1) },
      ],
    },
  },
  {
    label: 'Ratchet',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.0238, 0.0952), point(0.0936, 0.1428), point(0.1186, 0.2382),
        point(0.1974, 0.2857), point(0.2236, 0.381), point(0.3138, 0.4285), point(0.3413, 0.5238),
        point(0.4477, 0.5715), point(0.4764, 0.6667), point(0.6018, 0.7143), point(0.632, 0.8095), point(0.7826, 0.8572),
        point(0.8144, 0.9523), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0021, 0.0201), cp2: point(0.018, 0.0881) },
        { cp1: point(0.0471, 0.1135), cp2: point(0.0703, 0.1149) },
        { cp1: point(0.0957, 0.1629), cp2: point(0.1124, 0.2313) },
        { cp1: point(0.1449, 0.2568), cp2: point(0.1711, 0.2584) },
        { cp1: point(0.1997, 0.3058), cp2: point(0.2171, 0.3742) },
        { cp1: point(0.2537, 0.4002), cp2: point(0.2837, 0.402) },
        { cp1: point(0.3161, 0.4487), cp2: point(0.3344, 0.5172) },
        { cp1: point(0.3767, 0.5438), cp2: point(0.4122, 0.546) },
        { cp1: point(0.45, 0.5917), cp2: point(0.4692, 0.6602) },
        { cp1: point(0.5182, 0.6874), cp2: point(0.56, 0.6897) },
        { cp1: point(0.6042, 0.7346), cp2: point(0.6244, 0.8032) },
        { cp1: point(0.6822, 0.8311), cp2: point(0.7324, 0.8336) },
        { cp1: point(0.7904, 0.8798), cp2: point(0.7982, 0.9349) },
        { cp1: point(0.8763, 0.975), cp2: point(0.9381, 0.9776) },
      ],
    },
  },
  {
    label: 'Stapler',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.0357, 0.3333), point(0.1217, 0.5555), point(0.9791, 0.7778), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0026, 0.0431), cp2: point(0.0301, 0.3039) },
        { cp1: point(0.0452, 0.3816), cp2: point(0.1025, 0.5309) },
        { cp1: point(0.2552, 0.7347), cp2: point(0.7458, 0.7481) },
        { cp1: point(0.9824, 0.802), cp2: point(0.9963, 0.9674) },
      ],
    },
  },
  {
    label: 'Magnetic Latch',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.5048, 0.3333), point(0.9546, 0.7778), point(1, 1),
      ],
      segments: [
        { cp1: point(0.061, 0.0356), cp2: point(0.4354, 0.2688) },
        { cp1: point(0.5991, 0.3901), cp2: point(0.9087, 0.6897) },
        { cp1: point(0.9771, 0.8079), cp2: point(1, 0.8633) },
      ],
    },
  },
  {
    label: 'Cork Pop',
    category: 'devices',
    curve: {
      anchors: [
        point(0, 0), point(0.28, 0.08), point(0.58, 0.34), point(0.68, 0.58), point(0.74, 1.08), point(1, 1),
      ],
      segments: [
        { cp1: point(0.04, 0.005), cp2: point(0.2212, 0.0378) },
        { cp1: point(0.3659, 0.112), cp2: point(0.4994, 0.2081) },
        { cp1: point(0.62, 0.42), cp2: point(0.65, 0.50) },
        { cp1: point(0.70, 0.70), cp2: point(0.72, 0.95) },
        { cp1: point(0.78, 1.12), cp2: point(0.90, 1.02) },
      ],
    },
  },
  {
    label: 'Trigger Pull',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0845, 0.3333), point(0.9151, 0.6667), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0067, 0.2196), cp2: point(0.049, 0.3021) },
        { cp1: point(0.2691, 0.4075), cp2: point(0.5459, 0.5183) },
        { cp1: point(0.9655, 0.6911), cp2: point(0.9913, 0.8172) },
      ],
    },
  },
  {
    label: 'Galloping',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.018, 0.0952), point(0.1185, 0.1435), point(0.144, 0.2857), point(0.2426, 0.3333),
        point(0.3122, 0.5238), point(0.4557, 0.5715), point(0.4839, 0.7143), point(0.6861, 0.7618),
        point(0.7146, 0.9048), point(0.9934, 0.9523),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0, 0.0301), cp2: point(0.0058, 0.0759) },
        { cp1: point(0.051, 0.1377), cp2: point(0.0858, 0.13) },
        { cp1: point(0.1346, 0.1977), cp2: point(0.1413, 0.2498) },
        { cp1: point(0.1769, 0.3458), cp2: point(0.2097, 0.3272) },
        { cp1: point(0.2634, 0.3397), cp2: point(0.2919, 0.5332) },
        { cp1: point(0.36, 0.5312), cp2: point(0.4078, 0.5183) },
        { cp1: point(0.4595, 0.6033), cp2: point(0.4789, 0.6981) },
        { cp1: point(0.5513, 0.7301), cp2: point(0.6187, 0.7257) },
        { cp1: point(0.6901, 0.8242), cp2: point(0.7094, 0.8672) },
        { cp1: point(0.8075, 0.9314), cp2: point(0.9004, 0.9291) },
        { cp1: point(0.9956, 0.9655), cp2: point(0.9978, 0.9828) },
      ],
    },
  },
  {
    label: 'Machine',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0261, 0.0477), point(0.0894, 0.0952), point(0.1326, 0.1428), point(0.1572, 0.1905), point(0.1759, 0.2382),
        point(0.1893, 0.2857), point(0.212, 0.3333), point(0.2459, 0.381), point(0.3516, 0.4285), point(0.411, 0.4762), point(0.444, 0.5238),
        point(0.4669, 0.5715), point(0.4828, 0.619), point(0.5113, 0.6667), point(0.5574, 0.7143), point(0.781, 0.7618), point(0.8676, 0.8095),
        point(0.9153, 0.8572), point(0.9438, 0.9048), point(0.963, 0.9523), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0087, 0.0328), cp2: point(0.0174, 0.0416) },
        { cp1: point(0.0472, 0.0591), cp2: point(0.0683, 0.0521) },
        { cp1: point(0.1038, 0.1238), cp2: point(0.1182, 0.1342) },
        { cp1: point(0.1408, 0.1446), cp2: point(0.149, 0.1565) },
        { cp1: point(0.1635, 0.2074), cp2: point(0.1697, 0.222) },
        { cp1: point(0.1804, 0.2571), cp2: point(0.1848, 0.2735) },
        { cp1: point(0.1969, 0.3035), cp2: point(0.2044, 0.312) },
        { cp1: point(0.2233, 0.3683), cp2: point(0.2346, 0.3756) },
        { cp1: point(0.2812, 0.3934), cp2: point(0.3164, 0.3865) },
        { cp1: point(0.3714, 0.459), cp2: point(0.3912, 0.4682) },
        { cp1: point(0.422, 0.4776), cp2: point(0.433, 0.4852) },
        { cp1: point(0.4516, 0.5408), cp2: point(0.4592, 0.5553) },
        { cp1: point(0.4722, 0.5907), cp2: point(0.4775, 0.6071) },
        { cp1: point(0.4923, 0.6372), cp2: point(0.5018, 0.645) },
        { cp1: point(0.5267, 0.7046), cp2: point(0.542, 0.7097) },
        { cp1: point(0.6319, 0.7282), cp2: point(0.7064, 0.7249) },
        { cp1: point(0.8099, 0.7949), cp2: point(0.8388, 0.8024) },
        { cp1: point(0.8835, 0.8111), cp2: point(0.8994, 0.8119) },
        { cp1: point(0.9248, 0.8742), cp2: point(0.9343, 0.8886) },
        { cp1: point(0.9502, 0.9244), cp2: point(0.9566, 0.9408) },
        { cp1: point(0.9754, 0.971), cp2: point(0.9877, 0.978) },
      ],
    },
  },
  {
    label: 'Slope',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0519, 0.7778), point(0.2076, 0.8915), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0018, 0.1112), cp2: point(0.0018, 0.6857) },
        { cp1: point(0.0992, 0.868), cp2: point(0.1521, 0.8795) },
        { cp1: point(0.4534, 0.9304), cp2: point(0.7566, 0.9641) },
      ],
    },
  },
  {
    label: 'Bow',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.1031, 0.5555), point(0.9866, 0.7778), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0054, 0.0742), cp2: point(0.0157, 0.4892) },
        { cp1: point(0.3796, 0.7677), cp2: point(0.6206, 0.5938) },
        { cp1: point(0.9888, 0.8146), cp2: point(0.9978, 0.9629) },
      ],
    },
  },
  {
    label: 'Vibration',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0052, 0.1302), point(0.1217, 0.1613), point(0.1466, 0.2581), point(0.2486, 0.2904),
        point(0.2506, 0.3549), point(0.3731, 0.3871), point(0.3751, 0.4516), point(0.4771, 0.4839), point(0.5031, 0.5806),
        point(0.6232, 0.6129), point(0.6252, 0.6774), point(0.7478, 0.7096), point(0.75, 0.7742), point(0.8737, 0.8387),
        point(0.8757, 0.9032), point(0.998, 0.9355), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0002, 0.1129), cp2: point(0.0034, 0.1141) },
        { cp1: point(0.0408, 0.1557), cp2: point(0.0812, 0.1534) },
        { cp1: point(0.1239, 0.1671), cp2: point(0.1338, 0.2291) },
        { cp1: point(0.181, 0.2619), cp2: point(0.2155, 0.2571) },
        { cp1: point(0.25, 0.3065), cp2: point(0.2503, 0.3387) },
        { cp1: point(0.2919, 0.3718), cp2: point(0.3332, 0.3704) },
        { cp1: point(0.3748, 0.4032), cp2: point(0.3751, 0.4355) },
        { cp1: point(0.4091, 0.4851), cp2: point(0.4431, 0.4801) },
        { cp1: point(0.4927, 0.5144), cp2: point(0.5011, 0.5748) },
        { cp1: point(0.5437, 0.5888), cp2: point(0.5842, 0.5866) },
        { cp1: point(0.6249, 0.629), cp2: point(0.6251, 0.6612) },
        { cp1: point(0.6661, 0.702), cp2: point(0.7069, 0.7001) },
        { cp1: point(0.7485, 0.7124), cp2: point(0.75, 0.7581) },
        { cp1: point(0.7817, 0.8053), cp2: point(0.8442, 0.8202) },
        { cp1: point(0.8749, 0.8549), cp2: point(0.8753, 0.8871) },
        { cp1: point(0.9169, 0.9182), cp2: point(0.9582, 0.9168) },
        { cp1: point(0.9997, 0.9516), cp2: point(0.9999, 0.9839) },
      ],
    },
  },
  {
    label: 'Heartbeat',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0478, 0.0952), point(0.1963, 0.1428), point(0.2803, 0.4285), point(0.5015, 0.4762),
        point(0.5975, 0.7618), point(0.9682, 0.8095), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0074, 0.0596), cp2: point(0.0254, 0.0979) },
        { cp1: point(0.0973, 0.1017), cp2: point(0.1468, 0.0862) },
        { cp1: point(0.2138, 0.2666), cp2: point(0.2322, 0.4373) },
        { cp1: point(0.354, 0.4354), cp2: point(0.4278, 0.4222) },
        { cp1: point(0.5214, 0.5971), cp2: point(0.5399, 0.7552) },
        { cp1: point(0.7211, 0.7692), cp2: point(0.8447, 0.7595) },
        { cp1: point(0.9734, 0.8413), cp2: point(0.9946, 0.9684) },
      ],
    },
  },
  {
    label: 'Recoil',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.7593, 0.1112), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0162, 0.0044), cp2: point(0.4979, 0.0126) },
        { cp1: point(0.8237, 0.144), cp2: point(0.9344, 0.7032) },
      ],
    },
  },
  {
    label: 'Choppy',
    category: 'dualsense',
    curve: {
      anchors: [
        point(0, 0), point(0.0179, 0.2222), point(0.1137, 0.3333), point(0.1688, 0.663), point(0.9818, 0.7778), point(1, 1),
      ],
      segments: [
        { cp1: point(0.0028, 0.0371), cp2: point(0.0147, 0.195) },
        { cp1: point(0.0498, 0.3074), cp2: point(0.0818, 0.3061) },
        { cp1: point(0.1335, 0.3874), cp2: point(0.137, 0.6657) },
        { cp1: point(0.4274, 0.7023), cp2: point(0.7109, 0.6866) },
        { cp1: point(0.9851, 0.8026), cp2: point(0.9972, 0.9629) },
      ],
    },
  },
]

const PREVIEW_MODES: Array<{ id: PreviewMode; label: string; icon: JSX.Element }> = [
  {
    id: 'move-x',
    label: 'Move x',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 12h10m-3-3l3 3l-3 3M7 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0" />
      </svg>
    ),
  },
  {
    id: 'move-y',
    label: 'Move y',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13V3M9 6l3-3l3 3m-3 11a2 2 0 1 1 0 4a2 2 0 0 1 0-4" />
      </svg>
    ),
  },
  {
    id: 'scale-x',
    label: 'Scale x',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6m-10 6H3m18 0h-7m-8-3l-3 3l3 3m12-6l3 3l-3 3" />
      </svg>
    ),
  },
  {
    id: 'scale-y',
    label: 'Scale y',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6m6 10v7m0-18v7m-3 8l3 3l3-3M15 6l3-3l3 3" />
      </svg>
    ),
  },
  {
    id: 'scale',
    label: 'Scale',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
          <path d="M4 11v8a1 1 0 0 0 1 1h8M4 6V5a1 1 0 0 1 1-1h1m5 0h2m5 0h1a1 1 0 0 1 1 1v1m0 5v2m0 5v1a1 1 0 0 1-1 1h-1" />
          <path d="M4 12h7a1 1 0 0 1 1 1v7" />
        </g>
      </svg>
    ),
  },
  {
    id: 'rotate-z',
    label: 'Rotate z 90deg',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
          <path d="M19.95 11a8 8 0 1 0-.5 4m.5 5v-5h-5" />
          <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0" />
        </g>
      </svg>
    ),
  },
  {
    id: 'opacity',
    label: 'Opacity',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <path fill="currentColor" d="M19 2a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm0 2H5a1 1 0 0 0-1 1v14a1 1 0 0 0 .769.973c3.499-.347 7.082-4.127 7.226-7.747L12 12c0-3.687 3.66-7.619 7.232-7.974A1 1 0 0 0 19 4" />
      </svg>
    ),
  },
  {
    id: 'rotate-x',
    label: 'Rotate x 180deg',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none">
          <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
          <path fill="currentColor" d="M12 2c.852 0 1.505.519 1.953 1.088c.458.581.826 1.36 1.117 2.232c.585 1.755.93 4.117.93 6.68s-.345 4.925-.93 6.68c-.29.873-.66 1.651-1.117 2.232c-.448.57-1.1 1.088-1.953 1.088c-1.197 0-2-.998-2.486-1.923c-.532-1.008-.933-2.373-1.189-3.914a1 1 0 0 1 1.974-.326c.235 1.422.589 2.558.984 3.308c.198.376.383.61.53.74c.194.17.334.07.469-.087l.1-.124c.26-.33.539-.87.79-1.626c.501-1.502.828-3.64.828-6.048s-.327-4.546-.827-6.048c-.252-.756-.53-1.296-.79-1.626l-.096-.116c-.145-.164-.296-.262-.497-.074c-.163.152-.363.422-.57.844a8.6 8.6 0 0 0-.522 1.387a1 1 0 0 1 .85 1.725l-.099.078l-1.617 1.132a.997.997 0 0 1-1.385-.186L7.271 7.433A1 1 0 0 1 8.704 6.07c.201-.742.443-1.41.721-1.974c.271-.55.6-1.048 1-1.422C10.831 2.294 11.363 2 12 2m1 9v2H5a1 1 0 0 1-.117-1.993L5 11zm6 0h-2v2h2a1 1 0 1 0 0-2" />
        </g>
      </svg>
    ),
  },
  {
    id: 'rotate-y',
    label: 'Rotate y 180deg',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none">
          <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
          <path fill="currentColor" d="m7.433 7.271l1.58 1.106a1 1 0 0 1 .29 1.455L8.17 11.45a1 1 0 0 1-1.803-.75a8.6 8.6 0 0 0-1.387.52c-.422.208-.692.408-.844.571c-.188.201-.09.352.074.497l.116.095c.33.26.87.539 1.626.79C7.454 13.674 9.592 14 12 14s4.546-.327 6.048-.827c.756-.252 1.296-.53 1.626-.79l.124-.101c.157-.135.258-.275.088-.468c-.13-.148-.365-.333-.74-.53c-.751-.396-1.887-.75-3.31-.985a1 1 0 1 1 .327-1.974c1.541.256 2.906.657 3.914 1.189C21.002 10 22 10.803 22 12c0 .852-.519 1.505-1.088 1.953c-.581.458-1.36.826-2.232 1.117c-1.755.585-4.117.93-6.68.93s-4.925-.345-6.68-.93c-.873-.29-1.651-.66-2.232-1.117C2.518 13.505 2 12.853 2 12c0-.636.295-1.168.674-1.575c.374-.4.873-.729 1.422-1c.565-.278 1.232-.52 1.974-.72A1 1 0 0 1 7.433 7.27ZM12 4a1 1 0 0 1 1 1v8h-2V5a1 1 0 0 1 1-1m-1 15v-2h2v2a1 1 0 1 1-2 0" />
        </g>
      </svg>
    ),
  },
]

const SAMPLING_MODES: Array<{ id: SamplingMode; label: string; note: string; icon: JSX.Element }> = [
  {
    id: 'smart',
    label: 'smart sampling',
    note: 'Adds stops where the curve bends most',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none">
          <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
          <path fill="currentColor" d="m3.007 8.53l.024.06l.13.38a3 3 0 0 0 2.506 2.008c.022 1.778.935 3.72 3.024 5.39c2.076 1.659 3.463 2.39 5.582 2.693a1.5 1.5 0 0 1-.425 2.97c-2.83-.405-4.708-1.464-7.03-3.32c-3.557-2.842-4.849-6.784-3.811-10.18m18.423.889c.467 1.112.936 2.4.977 3.696c.045 1.396-.407 2.76-1.64 3.905c-1.27 1.176-2.91 1.49-4.37 1.42c-1.464-.069-2.918-.523-4.069-1.098a1.501 1.501 0 0 1 1.342-2.684c.849.425 1.896.74 2.868.786c.976.046 1.71-.18 2.189-.624c.543-.504.702-1.005.682-1.61c-.022-.703-.293-1.552-.745-2.63A1.5 1.5 0 0 1 21.43 9.42m-.3-6.55a1.5 1.5 0 0 1 0 2.12l-9.899 9.9a1.5 1.5 0 0 1-2.12-2.121l9.899-9.9a1.5 1.5 0 0 1 2.12 0M6 1a1 1 0 0 1 .946.677l.13.378c.3.879.99 1.57 1.87 1.87l.377.129a1 1 0 0 1 0 1.892l-.378.13c-.879.3-1.57.99-1.87 1.87l-.129.377a1 1 0 0 1-1.892 0l-.13-.378a3 3 0 0 0-1.87-1.87l-.377-.129a1 1 0 0 1 0-1.892l.378-.13c.879-.3 1.57-.99 1.87-1.87l.129-.377A1 1 0 0 1 6 1m7.852 1.918a1.5 1.5 0 0 1-.706 2.916a7.5 7.5 0 0 0-1.22-.19A3 3 0 0 0 12 5c0-.938-.438-1.8-1.148-2.357c.999-.056 2.014.036 3 .275" />
        </g>
      </svg>
    ),
  },
  {
    id: 'regular',
    label: 'regular sampling',
    note: 'Spaces stops evenly across progress',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
        <g fill="none" fill-rule="evenodd">
          <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
          <path fill="currentColor" d="M18 17a3 3 0 1 1-2.83 4H14a1 1 0 1 1 0-2h1.17A3 3 0 0 1 18 17m2-14a1 1 0 1 1 0 2c-1.605 0-2.848.78-3.982 2.14c-.982 1.179-1.812 2.71-2.66 4.382l-.99 1.974c-.838 1.65-1.746 3.32-2.85 4.644C8.152 19.78 6.395 21 4 21a1 1 0 1 1 0-2c1.605 0 2.848-.78 3.982-2.14c.982-1.179 1.812-2.71 2.66-4.382l.99-1.974c.838-1.65 1.746-3.32 2.85-4.644C15.848 4.22 17.605 3 20 3m-2 16a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-7 0a1 1 0 0 1 .117 1.993L11 21h-1a1 1 0 0 1-.117-1.993L10 19zM6 1a3 3 0 0 1 2.762 1.828L8.83 3H10a1 1 0 0 1 .117 1.993L10 5H8.83A3.001 3.001 0 1 1 6 1m0 2a1 1 0 1 0 0 2a1 1 0 0 0 0-2m8 0a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2z" />
        </g>
      </svg>
    ),
  },
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

const buildMiniCurvePath = (curve: Curve, width: number, height: number) => {
  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  let yMin = 0
  let yMax = 1

  for (const anchor of curve.anchors) {
    if (anchor.y < yMin) yMin = anchor.y
    if (anchor.y > yMax) yMax = anchor.y
  }

  for (const segment of curve.segments) {
    for (const cp of [segment.cp1, segment.cp2]) {
      if (cp.y < yMin) yMin = cp.y
      if (cp.y > yMax) yMax = cp.y
    }
  }

  const yRange = yMax - yMin || 1
  const toX = (x: number) => pad + x * w
  const toY = (y: number) => pad + (yMax - y) / yRange * h
  const [first] = curve.anchors

  return curve.segments.reduce(
    (path, segment, index) =>
      `${path} C ${toX(segment.cp1.x)} ${toY(segment.cp1.y)}, ${toX(segment.cp2.x)} ${toY(segment.cp2.y)}, ${toX(curve.anchors[index + 1].x)} ${toY(curve.anchors[index + 1].y)}`,
    `M ${toX(first.x)} ${toY(first.y)}`,
  )
}

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

const NORMALIZED_PRESET_JSONS = PRESETS.map((p) => JSON.stringify(normalizeCurve(p.curve)))

const findMatchingPreset = (c: Curve): number | null => {
  const index = NORMALIZED_PRESET_JSONS.indexOf(JSON.stringify(c))
  return index >= 0 ? index : null
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

const curveToHash = (curve: Curve): string => {
  const numbers: number[] = [curve.anchors[0].x, curve.anchors[0].y]

  for (let index = 0; index < curve.segments.length; index += 1) {
    numbers.push(
      curve.segments[index].cp1.x,
      curve.segments[index].cp1.y,
      curve.segments[index].cp2.x,
      curve.segments[index].cp2.y,
      curve.anchors[index + 1].x,
      curve.anchors[index + 1].y,
    )
  }

  return numbers.map((n) => formatNumber(n, 4)).join(',')
}

const hashToCurve = (hash: string): Curve | null => {
  const raw = hash.replace(/^#/, '')

  if (!raw) {
    return null
  }

  const numbers = raw.split(',').map(Number)

  if (numbers.some((n) => !Number.isFinite(n))) {
    return null
  }

  if (numbers.length < 8 || (numbers.length - 2) % 6 !== 0) {
    return null
  }

  const anchors: Point[] = [point(numbers[0], numbers[1])]
  const segments: Segment[] = []

  for (let index = 2; index < numbers.length; index += 6) {
    segments.push({
      cp1: point(numbers[index], numbers[index + 1]),
      cp2: point(numbers[index + 2], numbers[index + 3]),
    })
    anchors.push(point(numbers[index + 4], numbers[index + 5]))
  }

  return { anchors, segments }
}

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
  const initialCurve = hashToCurve(window.location.hash)

  const [editorState, setEditorState] = createSignal<EditorState>(
    normalizeEditorState({
      curve: initialCurve ? initialCurve : cloneCurve(PRESETS[5].curve),
      selectedSegment: 0,
    }),
  )
  const [past, setPast] = createSignal<EditorState[]>([])
  const [future, setFuture] = createSignal<EditorState[]>([])
  const [stopCount, setStopCount] = createSignal(24)
  const [samplingMode, setSamplingMode] = createSignal<SamplingMode>('smart')
  const [duration, setDuration] = createSignal(650)
  const [previewMode, setPreviewMode] = createSignal<PreviewMode>('move-x')
  const [copyLabel, setCopyLabel] = createSignal('Copy CSS')
  const [clock, setClock] = createSignal(0)
  const [dragTarget, setDragTarget] = createSignal<DragTarget | null>(null)
  const [dragOrigin, setDragOrigin] = createSignal<EditorState | null>(null)
  const [shiftHeld, setShiftHeld] = createSignal(false)
  const [modHeld, setModHeld] = createSignal(false)
  const [activePreset, setActivePreset] = createSignal<number | null>(initialCurve ? null : 5)
  const [presetCategory, setPresetCategory] = createSignal<PresetCategory>('standard')
  const filteredPresets = createMemo(() =>
    PRESETS.map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => preset.category === presetCategory()),
  )

  let svgRef: SVGSVGElement | undefined
  let copyResetTimer: number | undefined
  let frameHandle = 0

  const curve = createMemo(() => editorState().curve)
  const selectedSegment = createMemo(() => editorState().selectedSegment)
  const canUndo = createMemo(() => past().length > 0)
  const canRedo = createMemo(() => future().length > 0)
  const canDelete = createMemo(() => curve().segments.length > 1)
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

  createEffect(() => {
    const hash = curveToHash(curve())
    window.history.replaceState(null, '', `#${hash}`)
  })

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
    setActivePreset(null)
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
    setActivePreset(findMatchingPreset(previous.curve))
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
    setActivePreset(findMatchingPreset(next.curve))
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
      {
        hotkey: 'Backspace',
        callback: () => deleteSegment(),
        options: { enabled: canDelete(), preventDefault: true },
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
        setActivePreset(null)
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

  const applyPreset = (presetCurve: Curve, presetIndex: number) => {
    commitEditorState({ curve: cloneCurve(presetCurve), selectedSegment: 0 })
    setActivePreset(presetIndex)
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
          <div class="preset-section">
            <div class="preset-tabs">
              <For each={PRESET_CATEGORIES}>
                {(category) => (
                  <button
                    class={`preset-tab ${presetCategory() === category ? 'is-active' : ''}`}
                    onClick={() => setPresetCategory(category)}
                    type="button"
                  >
                    <span class="preset-tab-icon" aria-hidden="true">{PRESET_CATEGORY_ICONS[category]}</span>
                    {PRESET_CATEGORY_LABELS[category]}
                  </button>
                )}
              </For>
            </div>
            <div class="chip-group preset-group">
              <For each={filteredPresets()}>
                {({ preset, index }) => (
                  <button
                    class={`chip-button preset-chip ${activePreset() === index ? 'is-active' : ''}`}
                    onClick={() => applyPreset(preset.curve, index)}
                    type="button"
                  >
                    <Show when={preset.logo} fallback={
                      <svg class="preset-icon" viewBox="0 0 32 24">
                        <path d={buildMiniCurvePath(preset.curve, 32, 24)} />
                      </svg>
                    }>
                      <img class={`preset-logo${preset.darkLogo ? ' is-dark' : ''}`} src={preset.logo} alt={preset.brand} />
                    </Show>
                    <span class="preset-label">
                      {preset.label}
                      {preset.brand && <span class="preset-brand">{preset.brand}</span>}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="editor-toolbar">
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
                    aria-label={mode.label}
                    class={`mode-chip ${previewMode() === mode.id ? 'is-active' : ''}`}
                    onClick={() => setPreviewMode(mode.id)}
                    title={mode.label}
                    type="button"
                  >
                    <span class="mode-chip-icon" aria-hidden="true">{mode.icon}</span>
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
                    <span class="sampling-chip-header">
                      <span class="sampling-chip-icon" aria-hidden="true">{mode.icon}</span>
                      <span class="sampling-chip-label">{mode.label}</span>
                    </span>
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
