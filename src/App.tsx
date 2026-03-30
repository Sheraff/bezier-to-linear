import { createHotkeys, formatForDisplay } from '@tanstack/solid-hotkeys'
import { For, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
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
    label: 'Ease in',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.5, 0), cp2: point(0.75, 0) }],
    },
  },
  {
    label: 'Ease out',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.25, 1), cp2: point(0.5, 1) }],
    },
  },
  {
    label: 'Ease in-out',
    curve: {
      anchors: [point(0, 0), point(1, 1)],
      segments: [{ cp1: point(0.44, 0), cp2: point(0.56, 1) }],
    },
  },
  {
    label: 'Overshoot',
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
    label: 'Toggle Switch',
    curve: {
      anchors: [
        point(0, 0), point(0.0047, 0.1112), point(0.0094, 0.2222),
        point(0.0151, 0.3333), point(0.0503, 0.4445), point(0.9468, 0.5555),
        point(0.982, 0.6667), point(0.9877, 0.7778), point(0.9929, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0016, 0.0371), cp2: point(0.0031, 0.0741) },
        { cp1: point(0.0062, 0.1486), cp2: point(0.0078, 0.1858) },
        { cp1: point(0.0113, 0.2672), cp2: point(0.0132, 0.3051) },
        { cp1: point(0.0268, 0.4416), cp2: point(0.0386, 0.4369) },
        { cp1: point(0.3491, 0.4994), cp2: point(0.648, 0.5006) },
        { cp1: point(0.9585, 0.5631), cp2: point(0.9703, 0.5584) },
        { cp1: point(0.9839, 0.6949), cp2: point(0.9858, 0.7328) },
        { cp1: point(0.9895, 0.819), cp2: point(0.9912, 0.8563) },
        { cp1: point(0.9953, 0.9323), cp2: point(0.9976, 0.9687) },
      ],
    },
  },
  {
    label: 'Bow Release',
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
    curve: {
      anchors: [
        point(0, 0), point(0.0064, 0.0477), point(0.0238, 0.0952),
        point(0.0936, 0.1428), point(0.1001, 0.1905), point(0.1186, 0.2382),
        point(0.1974, 0.2857), point(0.2042, 0.3333), point(0.2236, 0.381),
        point(0.3138, 0.4285), point(0.3208, 0.4762), point(0.3413, 0.5238),
        point(0.4477, 0.5715), point(0.4548, 0.619), point(0.4764, 0.6667),
        point(0.6018, 0.7143), point(0.6092, 0.7618), point(0.632, 0.8095),
        point(0.7826, 0.8572), point(0.7903, 0.9048), point(0.8144, 0.9523),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0021, 0.0201), cp2: point(0.0042, 0.0358) },
        { cp1: point(0.0122, 0.0766), cp2: point(0.018, 0.0881) },
        { cp1: point(0.0471, 0.1135), cp2: point(0.0703, 0.1149) },
        { cp1: point(0.0957, 0.1629), cp2: point(0.0979, 0.1787) },
        { cp1: point(0.1063, 0.2199), cp2: point(0.1124, 0.2313) },
        { cp1: point(0.1449, 0.2568), cp2: point(0.1711, 0.2584) },
        { cp1: point(0.1997, 0.3058), cp2: point(0.2019, 0.3216) },
        { cp1: point(0.2106, 0.3631), cp2: point(0.2171, 0.3742) },
        { cp1: point(0.2537, 0.4002), cp2: point(0.2837, 0.402) },
        { cp1: point(0.3161, 0.4487), cp2: point(0.3185, 0.4644) },
        { cp1: point(0.3276, 0.5063), cp2: point(0.3344, 0.5172) },
        { cp1: point(0.3767, 0.5438), cp2: point(0.4122, 0.546) },
        { cp1: point(0.45, 0.5917), cp2: point(0.4524, 0.6074) },
        { cp1: point(0.462, 0.6495), cp2: point(0.4692, 0.6602) },
        { cp1: point(0.5182, 0.6874), cp2: point(0.56, 0.6897) },
        { cp1: point(0.6042, 0.7346), cp2: point(0.6067, 0.7503) },
        { cp1: point(0.6168, 0.7928), cp2: point(0.6244, 0.8032) },
        { cp1: point(0.6822, 0.8311), cp2: point(0.7324, 0.8336) },
        { cp1: point(0.7852, 0.8776), cp2: point(0.7877, 0.8933) },
        { cp1: point(0.7983, 0.936), cp2: point(0.8063, 0.9462) },
        { cp1: point(0.8763, 0.975), cp2: point(0.9381, 0.9776) },
      ],
    },
  },
  {
    label: 'Stapler',
    curve: {
      anchors: [
        point(0, 0), point(0.0078, 0.1112), point(0.0188, 0.2222),
        point(0.0357, 0.3333), point(0.0643, 0.4445), point(0.1217, 0.5555),
        point(0.2851, 0.6667), point(0.9791, 0.7778), point(0.989, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.0026, 0.0431), cp2: point(0.0052, 0.0796) },
        { cp1: point(0.0115, 0.1553), cp2: point(0.0151, 0.1915) },
        { cp1: point(0.0245, 0.2679), cp2: point(0.0301, 0.3039) },
        { cp1: point(0.0452, 0.3816), cp2: point(0.0548, 0.4169) },
        { cp1: point(0.0834, 0.4972), cp2: point(0.1025, 0.5309) },
        { cp1: point(0.1761, 0.619), cp2: point(0.2306, 0.6477) },
        { cp1: point(0.5165, 0.726), cp2: point(0.7478, 0.7388) },
        { cp1: point(0.9824, 0.802), cp2: point(0.9857, 0.8484) },
        { cp1: point(0.9927, 0.9306), cp2: point(0.9963, 0.9674) },
      ],
    },
  },
  {
    label: 'Magnetic Latch',
    curve: {
      anchors: [
        point(0, 0), point(0.1831, 0.1112), point(0.351, 0.2222),
        point(0.5048, 0.3333), point(0.6444, 0.4445), point(0.7684, 0.5555),
        point(0.8743, 0.6667), point(0.9546, 0.7778), point(0.9951, 0.8888),
        point(1, 1),
      ],
      segments: [
        { cp1: point(0.061, 0.0356), cp2: point(0.1221, 0.0726) },
        { cp1: point(0.2391, 0.1467), cp2: point(0.295, 0.1836) },
        { cp1: point(0.4023, 0.2576), cp2: point(0.4536, 0.2946) },
        { cp1: point(0.5514, 0.3686), cp2: point(0.5979, 0.4056) },
        { cp1: point(0.6857, 0.4793), cp2: point(0.7271, 0.5161) },
        { cp1: point(0.8037, 0.5893), cp2: point(0.839, 0.6259) },
        { cp1: point(0.9011, 0.6977), cp2: point(0.9278, 0.733) },
        { cp1: point(0.9681, 0.8002), cp2: point(0.9816, 0.8261) },
        { cp1: point(0.9967, 0.8973), cp2: point(0.9984, 0.8938) },
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
const DELETE_HOTKEY_LABEL = formatForDisplay('Backspace')
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
  const [duration, setDuration] = createSignal(1100)
  const [previewMode, setPreviewMode] = createSignal<PreviewMode>('move-x')
  const [copyLabel, setCopyLabel] = createSignal('Copy CSS')
  const [clock, setClock] = createSignal(0)
  const [dragTarget, setDragTarget] = createSignal<DragTarget | null>(null)
  const [dragOrigin, setDragOrigin] = createSignal<EditorState | null>(null)
  const [shiftHeld, setShiftHeld] = createSignal(false)
  const [modHeld, setModHeld] = createSignal(false)
  const [activePreset, setActivePreset] = createSignal<number | null>(initialCurve ? null : 5)

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
                {(preset, index) => (
                  <button
                    class={`chip-button ${activePreset() === index() ? 'is-active' : ''}`}
                    onClick={() => applyPreset(preset.curve, index())}
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
                disabled={!canDelete()}
                onClick={deleteSegment}
                type="button"
              >
                Remove selected <span class="button-shortcut">{DELETE_HOTKEY_LABEL}</span>
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
