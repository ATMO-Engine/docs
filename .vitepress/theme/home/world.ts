/**
 * "Living ECS world" hero animation: entities drift through a flow field, flock loosely, link to their
 * neighbours and sit in a layered atmosphere above the editor's dotted viewport grid.
 *
 * Raw WebGL 1, no dependencies. Loaded lazily after first paint (see HomeHero.vue), so it never
 * delays the page; the hero's CSS background is a static look-alike shown until the first frame.
 */

export type Rgb = readonly [number, number, number];

export interface WorldPalette {
    dark: boolean;
    base: Rgb;
    fog: readonly [Rgb, Rgb, Rgb];
    grid: Rgb;
    axisX: Rgb;
    axisY: Rgb;
    link: Rgb;
    selection: Rgb;
}

export interface EntityKind {
    component: string;
    names: readonly string[];
    color: Rgb;
    /** CSS color, for the inspector card. */
    css: string;
}

export interface EntitySnapshot {
    id: number;
    name: string;
    component: string;
    color: string;
    /** World units: origin at the axes, y up, 10 px per unit. */
    x: number;
    y: number;
    rotation: number;
    scale: number;
}

export type WorldAction = "move" | "rotate" | "scale";

export interface WorldOptions {
    palette: WorldPalette;
    kinds: readonly EntityKind[];
    /** Element receiving pointer input (the hero section), so text above the canvas stays interactive. */
    pointerTarget: HTMLElement;
    /** Floating label following the selected entity, positioned directly (no Vue reactivity per frame). */
    label?: HTMLElement | null;
    animate: boolean;
    onSelect?(entity: EntitySnapshot): void;
    /** Fired once the first frame is on screen. */
    onReady?(): void;
}

export interface World {
    readonly playing: boolean;
    setPlaying(playing: boolean): void;
    step(): void;
    act(action: WorldAction): void;
    setPalette(palette: WorldPalette): void;
    /** Pause rendering while the hero is off-screen or the tab is hidden; resumes the previous state. */
    setVisible(visible: boolean): void;
    dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------

const FULLSCREEN_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Atmosphere: three domain-warped fog layers, rendered at half resolution. */
const FOG_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uFogA;
uniform vec3 uFogB;
uniform vec3 uFogC;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.02 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}
void main() {
    vec2 p = vec2(vUv.x * uRes.x / uRes.y, vUv.y);
    float t = uTime * 0.03;
    vec2 warp = vec2(fbm(p * 1.4 + vec2(t, -t * 0.6)), fbm(p * 1.4 + vec2(5.2 - t * 0.8, 1.3 + t)));
    float far = fbm(p * 1.1 + warp * 1.6 + vec2(t * 0.5, 0.0));
    float mid = fbm(p * 2.1 - warp * 1.2 + vec2(-t, t * 0.7) + 3.7);
    float near = fbm(p * 3.4 + warp * 0.8 + vec2(t * 1.6, -t * 0.4) + 8.1);

    // Lobes keep the light on the right, behind the animation, and away from the hero text.
    float lobeA = smoothstep(1.15, 0.05, distance(vUv, vec2(0.78, 0.62)));
    float lobeB = smoothstep(1.0, 0.0, distance(vUv, vec2(0.95, 0.15)));
    float lobeC = smoothstep(0.9, 0.0, distance(vUv, vec2(0.45, 1.05)));

    vec3 fog = uFogA * pow(far, 2.2) * 1.9 * lobeA
             + uFogB * pow(mid, 2.6) * 1.6 * lobeB
             + uFogC * pow(near, 3.0) * 1.3 * lobeC;
    float density = clamp(max(max(fog.r, fog.g), fog.b), 0.0, 1.0);
    gl_FragColor = vec4(fog, density);
}`;

/** Composite: base color, upscaled fog, dot grid, axes and dithering. */
const COMPOSITE_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uFog;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uOrigin;
uniform vec3 uBase;
uniform vec3 uGrid;
uniform vec3 uAxisX;
uniform vec3 uAxisY;
uniform float uDark;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
    vec4 fog = texture2D(uFog, vUv);
    vec3 color;
    if (uDark > 0.5) {
        color = uBase + fog.rgb;
    } else {
        // On light backgrounds the fog tints with its hue instead of adding light.
        vec3 hue = fog.rgb / max(fog.a, 0.001);
        color = mix(uBase, hue, (1.0 - exp(-fog.a * 1.3)) * 0.5);
    }

    vec2 px = gl_FragCoord.xy / uDpr;
    vec2 cell = mod(px - uOrigin + 12.0, 24.0) - 12.0;
    float dot = 1.0 - smoothstep(0.55, 1.35, length(cell));
    float gridAlpha = (uDark > 0.5 ? 0.09 : 0.16) * (0.65 + fog.a * 0.8);
    color = mix(color, uGrid, dot * gridAlpha);

    float lineWidth = 0.75;
    float vertical = 1.0 - smoothstep(0.0, lineWidth, abs(px.x - uOrigin.x));
    float horizontal = 1.0 - smoothstep(0.0, lineWidth, abs(px.y - uOrigin.y));
    float axisAlpha = uDark > 0.5 ? 0.38 : 0.45;
    color = mix(color, uAxisX, vertical * axisAlpha);
    color = mix(color, uAxisY, horizontal * axisAlpha);

    color += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
    gl_FragColor = vec4(color, 1.0);
}`;

const LINES_VS = `
attribute vec2 aPos;
attribute float aAlpha;
uniform vec2 uRes;
varying float vAlpha;
void main() {
    vAlpha = aAlpha;
    gl_Position = vec4(aPos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const LINES_FS = `
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
    gl_FragColor = vec4(uColor, vAlpha);
}`;

const POINTS_VS = `
attribute vec2 aPos;
attribute float aSize;
attribute vec3 aColor;
attribute float aRot;
attribute float aSelected;
attribute float aDepth;
uniform vec2 uRes;
uniform float uDpr;
varying vec3 vColor;
varying float vRot;
varying float vSelected;
varying float vDepth;
void main() {
    vColor = aColor;
    vDepth = aDepth;
    vRot = aRot;
    vSelected = aSelected;
    gl_PointSize = aSize * uDpr;
    gl_Position = vec4(aPos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Diamonds, outlined like the hierarchy icons; glowing in dark mode; selection ring when selected. */
const POINTS_FS = `
precision mediump float;
uniform float uDark;
uniform vec3 uSelection;
varying vec3 vColor;
varying float vRot;
varying float vSelected;
varying float vDepth;
void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    p = mat2(c, -s, s, c) * p;
    float d = abs(p.x) + abs(p.y);
    float aa = 0.02;
    float edge = 0.18;
    float stroke = smoothstep(edge - 0.045 - aa, edge - 0.045, d) * (1.0 - smoothstep(edge, edge + aa, d));
    float fill = 1.0 - smoothstep(edge - aa, edge, d);
    float ring = vSelected * smoothstep(0.30, 0.30 + aa, d) * (1.0 - smoothstep(0.335, 0.335 + aa, d));

    vec3 color = vColor;
    float alpha;
    if (uDark > 0.5) {
        float glow = exp(-d * 10.0) * 0.55;
        alpha = max(fill * 0.95, glow);
        color = mix(vColor, vec3(1.0), fill * 0.25);
    } else {
        alpha = max(stroke, fill * 0.16);
    }
    // Far entities fade into the atmosphere.
    alpha *= mix(0.28, 1.0, vDepth);
    color = mix(color, uSelection, ring);
    alpha = max(alpha, ring);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
}`;

// ---------------------------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------------------------

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error("createProgram failed");
    for (const [type, source] of [
        [gl.VERTEX_SHADER, vs],
        [gl.FRAGMENT_SHADER, fs],
    ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("createShader failed");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    return program;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

function uniforms(gl: WebGLRenderingContext, program: WebGLProgram, names: string[]): Uniforms {
    return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

const LINK_RADIUS = 118;
const SEPARATION_RADIUS = 30;
const POINTER_RADIUS = 150;
const MIN_SPEED = 7;
const MAX_SPEED = 26;
const BASE_SIZE = 26;
/** Entities only flock and link with others at a similar depth, which keeps the layers readable. */
const DEPTH_BAND = 0.28;
const MAX_LINKS = 4096;

interface Entity {
    id: number;
    name: string;
    kind: number;
    /** Parallax depth, 0.3 (far) to 1 (near): scales size, speed, opacity and links. */
    depth: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Extra velocity from the "move" action, decays over time. */
    ix: number;
    iy: number;
    rot: number;
    rotVel: number;
    scale: number;
    targetScale: number;
    scaleHold: number;
}

/** Deterministic PRNG so the initial layout is the same on every visit. */
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createWorld(canvas: HTMLCanvasElement, options: WorldOptions): World | null {
    const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "low-power",
    });
    if (!gl) return null;

    const fogProgram = compile(gl, FULLSCREEN_VS, FOG_FS);
    const compositeProgram = compile(gl, FULLSCREEN_VS, COMPOSITE_FS);
    const linesProgram = compile(gl, LINES_VS, LINES_FS);
    const pointsProgram = compile(gl, POINTS_VS, POINTS_FS);
    const fogU = uniforms(gl, fogProgram, ["uRes", "uTime", "uFogA", "uFogB", "uFogC"]);
    const compositeU = uniforms(gl, compositeProgram, [
        "uFog",
        "uRes",
        "uDpr",
        "uOrigin",
        "uBase",
        "uGrid",
        "uAxisX",
        "uAxisY",
        "uDark",
    ]);
    const linesU = uniforms(gl, linesProgram, ["uRes", "uColor"]);
    const pointsU = uniforms(gl, pointsProgram, ["uRes", "uDpr", "uDark", "uSelection"]);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const lineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    const lineData = new Float32Array(MAX_LINKS * 2 * 3);

    const fogTexture = gl.createTexture();
    const fogFramebuffer = gl.createFramebuffer();

    let palette = options.palette;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let fogWidth = 0;
    let fogHeight = 0;
    let originX = 0;
    let originY = 0;
    let time = 0;
    let playing = options.animate;
    let visible = true;
    let frame = 0;
    let last = 0;
    let disposed = false;
    let readyFired = false;
    let selected = 0;
    let autoSelectTimer = 7;
    let userSelected = false;
    let snapshotTimer = 0;
    const pointer = { x: -1e4, y: -1e4, active: false };

    const random = mulberry32(0xa7a0);
    const entities: Entity[] = [];
    const counters = new Map<number, number>();
    let pointData = new Float32Array(0);

    function spawn(): Entity {
        const kind = Math.floor(random() * options.kinds.length);
        const count = (counters.get(kind) ?? 0) + 1;
        counters.set(kind, count);
        const names = options.kinds[kind]?.names ?? ["Entity"];
        const base = names[(count - 1) % names.length] ?? "Entity";
        const angle = random() * Math.PI * 2;
        const speed = MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED);
        return {
            id: entities.length + 1,
            name: `${base}_${String(count).padStart(2, "0")}`,
            kind,
            depth: 0.3 + 0.7 * Math.pow(random(), 0.8),
            x: random() * width,
            y: random() * height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            ix: 0,
            iy: 0,
            rot: 0,
            rotVel: 0,
            scale: 1,
            targetScale: 1,
            scaleHold: 0,
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        // The origin (axes crossing) sits right of the hero text, like a viewport centered on the scene.
        originX = Math.round(width * (width > 900 ? 0.64 : 0.5));
        originY = Math.round(height * 0.44);

        fogWidth = Math.max(1, Math.round(canvas.width / 2));
        fogHeight = Math.max(1, Math.round(canvas.height / 2));
        gl!.bindTexture(gl!.TEXTURE_2D, fogTexture);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, fogWidth, fogHeight, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, fogFramebuffer);
        gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, fogTexture, 0);
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);

        // Density scales with area, so phones stay light and wide screens don't look empty.
        const target = Math.round(Math.min(260, Math.max(80, (width * height) / 5600)));
        while (entities.length < target) entities.push(spawn());
        if (entities.length > target) entities.length = target;
        // Draw far to near.
        const current = entities[selected];
        entities.sort((a, b) => a.depth - b.depth);
        selected = current ? entities.indexOf(current) : 0;
        for (const entity of entities) {
            entity.x = ((entity.x % width) + width) % width;
            entity.y = ((entity.y % height) + height) % height;
        }
        selected = Math.min(selected, entities.length - 1);
        pointData = new Float32Array(entities.length * 9);
    }

    // Spatial hash for neighbour queries (links, flocking).
    let grid = new Map<number, number[]>();
    function buildGrid() {
        grid = new Map();
        const columns = Math.ceil(width / LINK_RADIUS) + 1;
        entities.forEach((e, i) => {
            const key = Math.floor(e.y / LINK_RADIUS) * columns + Math.floor(e.x / LINK_RADIUS);
            const bucket = grid.get(key);
            if (bucket) bucket.push(i);
            else grid.set(key, [i]);
        });
        return columns;
    }

    function forNeighbours(
        index: number,
        columns: number,
        visit: (j: number, dx: number, dy: number, d2: number) => void,
    ) {
        const e = entities[index]!;
        const cx = Math.floor(e.x / LINK_RADIUS);
        const cy = Math.floor(e.y / LINK_RADIUS);
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
                const bucket = grid.get(gy * columns + gx);
                if (!bucket) continue;
                for (const j of bucket) {
                    if (j === index) continue;
                    const o = entities[j]!;
                    const dx = o.x - e.x;
                    const dy = o.y - e.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < LINK_RADIUS * LINK_RADIUS) visit(j, dx, dy, d2);
                }
            }
        }
    }

    function simulate(dt: number) {
        time += dt;
        const columns = buildGrid();
        entities.forEach((e, i) => {
            let ax = 0;
            let ay = 0;
            let avx = 0;
            let avy = 0;
            let cx = 0;
            let cy = 0;
            let n = 0;
            forNeighbours(i, columns, (j, dx, dy, d2) => {
                const o = entities[j]!;
                if (Math.abs(o.depth - e.depth) > DEPTH_BAND) return;
                n++;
                avx += o.vx;
                avy += o.vy;
                cx += dx;
                cy += dy;
                if (d2 < SEPARATION_RADIUS * SEPARATION_RADIUS && d2 > 0.01) {
                    const d = Math.sqrt(d2);
                    ax -= (dx / d) * (SEPARATION_RADIUS - d) * 0.9;
                    ay -= (dy / d) * (SEPARATION_RADIUS - d) * 0.9;
                }
            });
            if (n > 0) {
                ax += (avx / n - e.vx) * 0.35 + (cx / n) * 0.012;
                ay += (avy / n - e.vy) * 0.35 + (cy / n) * 0.012;
            }
            // Slow flow field so the flock never settles into one blob.
            const flow =
                Math.sin(e.x * 0.0042 + time * 0.13) +
                Math.cos(e.y * 0.0051 - time * 0.11) +
                Math.sin((e.x + e.y) * 0.0017 + time * 0.07);
            ax += Math.cos(flow * 1.7) * 4.5;
            ay += Math.sin(flow * 1.7) * 4.5;

            if (pointer.active) {
                const dx = e.x - pointer.x;
                const dy = e.y - pointer.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < POINTER_RADIUS * POINTER_RADIUS && d2 > 1) {
                    const d = Math.sqrt(d2);
                    const push = (1 - d / POINTER_RADIUS) * 60;
                    ax += (dx / d) * push;
                    ay += (dy / d) * push;
                }
            }

            e.vx += ax * dt;
            e.vy += ay * dt;
            const speed = Math.hypot(e.vx, e.vy) || 1;
            const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
            e.vx = (e.vx / speed) * clamped;
            e.vy = (e.vy / speed) * clamped;

            const decay = Math.exp(-dt * 2.2);
            e.ix *= decay;
            e.iy *= decay;
            const parallax = 0.45 + 0.55 * e.depth;
            e.x += (e.vx * parallax + e.ix) * dt;
            e.y += (e.vy * parallax + e.iy) * dt;
            const margin = 30;
            if (e.x < -margin) e.x += width + margin * 2;
            if (e.x > width + margin) e.x -= width + margin * 2;
            if (e.y < -margin) e.y += height + margin * 2;
            if (e.y > height + margin) e.y -= height + margin * 2;

            e.rot += e.rotVel * dt;
            e.rotVel *= Math.exp(-dt * 1.6);
            if (e.scaleHold > 0) e.scaleHold -= dt;
            else e.targetScale = 1;
            e.scale += (e.targetScale - e.scale) * Math.min(1, dt * 6);
        });

        autoSelectTimer -= dt;
        const current = entities[selected];
        // An auto-selected entity drifting under the hero copy hands over to another one.
        if (autoSelectTimer <= 0 || (!userSelected && current && !inShowcase(current.x, current.y))) autoSelect();
    }

    /** Where auto-selected entities live: right of the hero copy on wide screens, below it on narrow ones. */
    function showcaseArea() {
        return width > 900
            ? { x0: width * 0.58, x1: width * 0.96, y0: height * 0.12, y1: height * 0.8 }
            : { x0: width * 0.08, x1: width * 0.92, y0: height * 0.72, y1: height * 0.86 };
    }

    function inShowcase(x: number, y: number): boolean {
        const area = showcaseArea();
        return x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
    }

    function autoSelect() {
        autoSelectTimer = 7;
        userSelected = false;
        const area = showcaseArea();
        const x = area.x0 + random() * (area.x1 - area.x0);
        const y = area.y0 + random() * (area.y1 - area.y0);
        let best = -1;
        let bestD2 = Infinity;
        entities.forEach((e, i) => {
            const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (e.depth > 0.6 && inShowcase(e.x, e.y) && d2 < bestD2) {
                best = i;
                bestD2 = d2;
            }
        });
        if (best >= 0) selected = best;
        emitSelection();
    }

    function selectNearest(x: number, y: number, maxDistance = Infinity): boolean {
        let best = -1;
        let bestD2 = maxDistance * maxDistance;
        entities.forEach((e, i) => {
            const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (d2 < bestD2) {
                best = i;
                bestD2 = d2;
            }
        });
        if (best < 0) return false;
        selected = best;
        emitSelection();
        return true;
    }

    function emitSelection() {
        const e = entities[selected];
        if (!e || !options.onSelect) return;
        const kind = options.kinds[e.kind];
        options.onSelect({
            id: e.id,
            name: e.name,
            component: kind?.component ?? "Entity2D",
            color: kind?.css ?? "#4c6ef5",
            x: (e.x - originX) / 10,
            y: (originY - e.y) / 10,
            rotation: ((((e.rot * 180) / Math.PI) % 360) + 360) % 360,
            scale: e.scale,
        });
    }

    function render() {
        const [br, bg, bb] = palette.base;
        // Pass 1: fog into the half-resolution target.
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, fogFramebuffer);
        gl!.viewport(0, 0, fogWidth, fogHeight);
        gl!.disable(gl!.BLEND);
        gl!.useProgram(fogProgram);
        gl!.uniform2f(fogU.uRes!, fogWidth, fogHeight);
        gl!.uniform1f(fogU.uTime!, time);
        gl!.uniform3fv(fogU.uFogA!, palette.fog[0]);
        gl!.uniform3fv(fogU.uFogB!, palette.fog[1]);
        gl!.uniform3fv(fogU.uFogC!, palette.fog[2]);
        drawFullscreen(fogProgram);

        // Pass 2: composite to screen.
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
        gl!.viewport(0, 0, canvas.width, canvas.height);
        gl!.clearColor(br, bg, bb, 1);
        gl!.clear(gl!.COLOR_BUFFER_BIT);
        gl!.useProgram(compositeProgram);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, fogTexture);
        gl!.uniform1i(compositeU.uFog!, 0);
        gl!.uniform2f(compositeU.uRes!, canvas.width, canvas.height);
        gl!.uniform1f(compositeU.uDpr!, dpr);
        // GL's y axis points up: convert the origin from CSS pixels.
        gl!.uniform2f(compositeU.uOrigin!, originX, height - originY);
        gl!.uniform3fv(compositeU.uBase!, palette.base);
        gl!.uniform3fv(compositeU.uGrid!, palette.grid);
        gl!.uniform3fv(compositeU.uAxisX!, palette.axisX);
        gl!.uniform3fv(compositeU.uAxisY!, palette.axisY);
        gl!.uniform1f(compositeU.uDark!, palette.dark ? 1 : 0);
        drawFullscreen(compositeProgram);

        // Pass 3: links between neighbours.
        gl!.enable(gl!.BLEND);
        gl!.blendFunc(gl!.SRC_ALPHA, palette.dark ? gl!.ONE : gl!.ONE_MINUS_SRC_ALPHA);
        const columns = buildGrid();
        let links = 0;
        for (let i = 0; i < entities.length && links < MAX_LINKS; i++) {
            const e = entities[i]!;
            forNeighbours(i, columns, (j, _dx, _dy, d2) => {
                if (j < i || links >= MAX_LINKS) return;
                const o = entities[j]!;
                if (Math.abs(o.depth - e.depth) > DEPTH_BAND) return;
                const strength = (1 - Math.sqrt(d2) / LINK_RADIUS) * Math.min(e.depth, o.depth);
                const highlight = i === selected || j === selected ? 1.8 : 1;
                const alpha = Math.min(1, strength * strength * (palette.dark ? 0.5 : 0.75) * highlight);
                const k = links * 6;
                lineData[k] = e.x;
                lineData[k + 1] = height - e.y;
                lineData[k + 2] = alpha;
                lineData[k + 3] = o.x;
                lineData[k + 4] = height - o.y;
                lineData[k + 5] = alpha;
                links++;
            });
        }
        gl!.useProgram(linesProgram);
        gl!.uniform2f(linesU.uRes!, width, height);
        gl!.uniform3fv(linesU.uColor!, palette.link);
        bindAttributes(linesProgram, lineBuffer, 12, [
            ["aPos", 2, 0],
            ["aAlpha", 1, 8],
        ]);
        gl!.bufferData(gl!.ARRAY_BUFFER, lineData.subarray(0, links * 6), gl!.DYNAMIC_DRAW);
        gl!.drawArrays(gl!.LINES, 0, links * 2);

        // Pass 4: entities.
        gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
        entities.forEach((e, i) => {
            const color = options.kinds[e.kind]?.color ?? [1, 1, 1];
            const k = i * 9;
            pointData[k] = e.x;
            pointData[k + 1] = height - e.y;
            pointData[k + 2] = BASE_SIZE * (0.45 + 0.55 * e.depth) * e.scale * (i === selected ? 1.25 : 1);
            pointData[k + 3] = color[0];
            pointData[k + 4] = color[1];
            pointData[k + 5] = color[2];
            pointData[k + 6] = e.rot;
            pointData[k + 7] = i === selected ? 1 : 0;
            pointData[k + 8] = i === selected ? 1 : e.depth;
        });
        gl!.useProgram(pointsProgram);
        gl!.uniform2f(pointsU.uRes!, width, height);
        gl!.uniform1f(pointsU.uDpr!, dpr);
        gl!.uniform1f(pointsU.uDark!, palette.dark ? 1 : 0);
        gl!.uniform3fv(pointsU.uSelection!, palette.selection);
        bindAttributes(pointsProgram, pointBuffer, 36, [
            ["aPos", 2, 0],
            ["aSize", 1, 8],
            ["aColor", 3, 12],
            ["aRot", 1, 24],
            ["aSelected", 1, 28],
            ["aDepth", 1, 32],
        ]);
        gl!.bufferData(gl!.ARRAY_BUFFER, pointData, gl!.DYNAMIC_DRAW);
        gl!.drawArrays(gl!.POINTS, 0, entities.length);

        const label = options.label;
        const e = entities[selected];
        if (label && e) label.style.transform = `translate3d(${Math.round(e.x + 16)}px, ${Math.round(e.y - 12)}px, 0)`;

        if (!readyFired) {
            readyFired = true;
            options.onReady?.();
        }
    }

    /**
     * Binds a buffer and exactly the given attributes. Attributes enabled for a previous program are
     * disabled first: a stale array pointing at a shorter buffer makes WebGL reject the draw call.
     */
    let enabledAttributes: number[] = [];
    function bindAttributes(
        program: WebGLProgram,
        buffer: WebGLBuffer | null,
        stride: number,
        specs: readonly (readonly [name: string, size: number, offset: number])[],
    ) {
        for (const location of enabledAttributes) gl!.disableVertexAttribArray(location);
        enabledAttributes = [];
        gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
        for (const [name, size, offset] of specs) {
            const location = gl!.getAttribLocation(program, name);
            if (location < 0) continue;
            gl!.enableVertexAttribArray(location);
            gl!.vertexAttribPointer(location, size, gl!.FLOAT, false, stride, offset);
            enabledAttributes.push(location);
        }
    }

    function drawFullscreen(program: WebGLProgram) {
        bindAttributes(program, quad, 8, [["aPos", 2, 0]]);
        gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function loop(now: number) {
        frame = 0;
        if (disposed || !visible) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        if (playing) simulate(dt);
        render();
        snapshotTimer -= dt;
        if (snapshotTimer <= 0) {
            snapshotTimer = 0.1;
            emitSelection();
        }
        if (playing) frame = requestAnimationFrame(loop);
    }

    function requestFrame() {
        if (!frame && visible && !disposed) {
            last = 0;
            frame = requestAnimationFrame(loop);
        }
    }

    // Input on the whole hero: the canvas sits behind the text.
    const target = options.pointerTarget;
    const toLocal = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        const { x, y } = toLocal(event);
        pointer.x = x;
        pointer.y = y;
        pointer.active = true;
    };
    const onLeave = () => {
        pointer.active = false;
    };
    const onClick = (event: PointerEvent) => {
        if ((event.target as Element).closest("a, button, input, .home-hero__panel")) return;
        const { x, y } = toLocal(event);
        if (selectNearest(x, y, 48)) {
            userSelected = true;
            autoSelectTimer = 12;
            requestFrame();
        }
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerleave", onLeave);
    target.addEventListener("pointerup", onClick);

    const observer = new ResizeObserver(() => {
        resize();
        requestFrame();
    });
    observer.observe(canvas);

    const onContextLost = (event: Event) => {
        event.preventDefault();
        disposed = true;
        cancelAnimationFrame(frame);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    resize();
    // Settle the flock before the first frame so it starts organized, even without animation.
    for (let i = 0; i < 90; i++) simulate(1 / 30);
    time = 0;
    autoSelect();
    requestFrame();

    return {
        get playing() {
            return playing;
        },
        setPlaying(value) {
            playing = value;
            if (playing) requestFrame();
        },
        step() {
            playing = false;
            simulate(1 / 15);
            requestFrame();
            emitSelection();
        },
        act(action) {
            const e = entities[selected];
            if (!e) return;
            if (action === "move") {
                const angle = random() * Math.PI * 2;
                e.ix += Math.cos(angle) * 220;
                e.iy += Math.sin(angle) * 220;
            } else if (action === "rotate") {
                e.rotVel += Math.PI * 2.4;
            } else {
                e.targetScale = 2.2;
                e.scaleHold = 1.4;
            }
            autoSelectTimer = Math.max(autoSelectTimer, 6);
            userSelected = true;
            if (!playing) {
                // Paused: play the action out in a few frames without resuming the scene.
                for (let i = 0; i < 20; i++) {
                    e.x += e.ix / 60;
                    e.y += e.iy / 60;
                    e.ix *= 0.93;
                    e.iy *= 0.93;
                    e.rot += e.rotVel / 60;
                    e.rotVel *= 0.97;
                    e.scale += (e.targetScale - e.scale) * 0.15;
                }
            }
            emitSelection();
            requestFrame();
        },
        setPalette(next) {
            palette = next;
            requestFrame();
        },
        setVisible(value) {
            visible = value;
            if (visible) requestFrame();
            else {
                cancelAnimationFrame(frame);
                frame = 0;
            }
        },
        dispose() {
            disposed = true;
            cancelAnimationFrame(frame);
            observer.disconnect();
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerleave", onLeave);
            target.removeEventListener("pointerup", onClick);
            canvas.removeEventListener("webglcontextlost", onContextLost);
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        },
    };
}
