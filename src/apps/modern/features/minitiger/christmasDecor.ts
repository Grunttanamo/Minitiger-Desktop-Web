// Christmas decorations: layered snowfall with wind, Santa's sleigh crossing
// the sky now and then, and small poster decorations (snow caps with
// icicles, hanging baubles, presents). Purely decorative and aria-hidden.

import { DECOR_CLASS, type DecorSet, prefersReducedMotion, random } from './seasonDecor';

type Flake = {
    x: number;
    y: number;
    depth: number;
    size: number;
    speed: number;
    swayAmplitude: number;
    swaySpeed: number;
    phase: number;
    spin: number;
    angle: number;
    crystal: boolean;
};

const createSprite = (radius: number, crystal: boolean, scale: number) => {
    const size = Math.ceil(radius * 2 * scale) + 4;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const center = size / 2;
    const r = radius * scale;
    if (crystal) {
        context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        context.lineWidth = Math.max(1, r * 0.13);
        context.lineCap = 'round';
        context.shadowColor = 'rgba(200, 235, 255, 0.9)';
        context.shadowBlur = r * 0.5;
        for (let arm = 0; arm < 6; arm++) {
            const angle = (arm * Math.PI) / 3;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            context.beginPath();
            context.moveTo(center, center);
            context.lineTo(center + cos * r, center + sin * r);
            // Two small branches per arm.
            for (const at of [0.45, 0.7]) {
                const bx = center + cos * r * at;
                const by = center + sin * r * at;
                const branch = r * 0.28;
                for (const side of [-1, 1]) {
                    const a = angle + side * 0.7;
                    context.moveTo(bx, by);
                    context.lineTo(bx + Math.cos(a) * branch, by + Math.sin(a) * branch);
                }
            }
            context.stroke();
        }
    } else {
        const gradient = context.createRadialGradient(center, center, 0, center, center, r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.45, 'rgba(240, 248, 255, 0.85)');
        gradient.addColorStop(1, 'rgba(220, 238, 255, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(center, center, r, 0, Math.PI * 2);
        context.fill();
    }
    return canvas;
};

/** Starts a canvas snowfall inside layer. Returns a stop function. */
export const startSnowfall = (layer: HTMLElement) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'mtSnowCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);
    const context = canvas.getContext('2d');
    if (!context) {
        canvas.remove();
        return () => { /* nothing to stop */ };
    }

    const reducedMotion = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let scale = 1;
    let flakes: Flake[] = [];
    const sprites = new Map<string, HTMLCanvasElement>();

    const spriteFor = (flake: Flake) => {
        const key = `${flake.crystal ? 'c' : 'd'}${flake.size.toFixed(1)}`;
        let sprite = sprites.get(key);
        if (!sprite) {
            sprite = createSprite(flake.size, flake.crystal, scale);
            sprites.set(key, sprite);
        }
        return sprite;
    };

    const createFlake = (anywhere: boolean): Flake => {
        // depth 0 = far behind (tiny, slow, faint), 1 = right in front.
        const depth = Math.pow(Math.random(), 1.6);
        const crystal = depth > 0.72 && Math.random() < 0.55;
        return {
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : -10 - Math.random() * 40,
            depth,
            // Rounded to keep the sprite cache small.
            size: Math.round((crystal ? 3.5 + depth * 5 : 0.8 + depth * 3.2) * 2) / 2,
            speed: 18 + depth * 70 + Math.random() * 12,
            swayAmplitude: 8 + Math.random() * 22,
            swaySpeed: 0.4 + Math.random() * 0.9,
            phase: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 1.2,
            angle: Math.random() * Math.PI,
            crystal
        };
    };

    const resize = () => {
        width = layer.clientWidth;
        height = layer.clientHeight;
        scale = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        sprites.clear();
        const count = Math.min(240, Math.round((width * height) / 8500));
        flakes = Array.from({ length: reducedMotion ? Math.round(count / 3) : count }, () => createFlake(true));
    };

    let time = 0;
    const windAt = (t: number) =>
        // Calm drift with an occasional gust, never a constant direction.
        Math.sin(t * 0.07) * 14 + Math.sin(t * 0.023 + 1.3) * 22 + Math.max(0, Math.sin(t * 0.11 + 4)) ** 6 * 45;

    const draw = () => {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const flake of flakes) {
            const sprite = spriteFor(flake);
            const x = (flake.x + Math.sin(time * flake.swaySpeed + flake.phase) * flake.swayAmplitude) * scale;
            const y = flake.y * scale;
            context.globalAlpha = 0.35 + flake.depth * 0.65;
            if (flake.crystal) {
                context.setTransform(1, 0, 0, 1, x, y);
                context.rotate(flake.angle);
                context.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
                context.setTransform(1, 0, 0, 1, 0, 0);
            } else {
                context.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
            }
        }
        context.globalAlpha = 1;
    };

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden) return;
        time += dt;
        const wind = windAt(time);
        for (let i = 0; i < flakes.length; i++) {
            const flake = flakes[i];
            flake.y += flake.speed * dt;
            flake.x += wind * (0.3 + flake.depth * 0.9) * dt;
            flake.angle += flake.spin * dt;
            if (flake.y > height + 20) {
                flakes[i] = createFlake(false);
            } else if (flake.x < -40) {
                flake.x += width + 80;
            } else if (flake.x > width + 40) {
                flake.x -= width + 80;
            }
        }
        draw();
    };

    resize();
    window.addEventListener('resize', resize);
    if (reducedMotion) {
        draw();
    } else {
        frame = requestAnimationFrame(tick);
    }

    return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
        canvas.remove();
    };
};

const SLEIGH_SVG = `
<svg viewBox="0 0 320 90" aria-hidden="true">
  <g class="mtSleighDust">
    <circle cx="300" cy="62" r="2.2"/><circle cx="312" cy="54" r="1.4"/><circle cx="292" cy="72" r="1.6"/>
    <circle cx="306" cy="78" r="1.1"/><circle cx="316" cy="68" r="1.8"/>
  </g>
  <g class="mtSleighShape">
    <path class="mtSleighReins" d="M70 40C110 46 150 50 196 52"/>
    <!-- Inner groups mirror each reindeer to face the flight direction; the
         outer group carries the CSS gallop, which would replace a transform
         attribute on the same element. -->
    <g class="mtReindeer"><g transform="translate(78 0) scale(-1 1)">
      <path d="M22 38c6-4 18-5 26-2 3-4 6-9 8-12l3 1-4 9 6-1 1 3-8 3c0 4-2 7-6 8l4 10-3 1-6-9h-10l-6 10-3-1 4-11c-4-2-7-5-6-9z"/>
      <path d="M58 25l2-8m-2 8 5-6m-3 6 6-2" class="mtAntler"/>
      <circle class="mtRudolphNose" cx="64" cy="33" r="2.4"/>
    </g></g>
    <g class="mtReindeer"><g transform="translate(206 0) scale(-1 1)">
      <path d="M86 44c6-4 18-5 26-2 3-4 6-9 8-12l3 1-4 9 6-1 1 3-8 3c0 4-2 7-6 8l4 10-3 1-6-9h-10l-6 10-3-1 4-11c-4-2-7-5-6-9z"/>
      <path d="M122 31l2-8m-2 8 5-6m-3 6 6-2" class="mtAntler"/>
    </g></g>
    <path d="M178 46h60c10 0 16-8 16-16h6c0 14-9 26-24 27h-50c-8 0-13-5-14-11z"/>
    <path d="M262 64h-80c-8 0-12-4-14-9l-4 2c3 7 9 12 18 12h80z"/>
    <path d="M186 58v6M236 58v6" class="mtSleighStrut"/>
    <circle cx="214" cy="26" r="7"/>
    <path d="M207 22c2-9 12-13 20-8l6-2-3 6c-6-3-15-2-23 4z"/>
    <path d="M204 31c6 2 14 2 20 0l4 15h-28z"/>
    <path d="M236 30c10-6 22-3 24 6l-2 10h-24z"/>
  </g>
</svg>`;

/** Lets Santa's sleigh cross the upper sky every minute or so. */
export const startSleighFlights = (layer: HTMLElement) => {
    if (prefersReducedMotion() || typeof layer.animate !== 'function') {
        return () => { /* nothing to stop */ };
    }

    let timer: number | undefined;
    let current: Animation | null = null;

    const fly = () => {
        const width = layer.clientWidth;
        const height = layer.clientHeight;
        if (document.hidden || current || width < 400 || height < 300) return;

        const size = Math.round(random(150, 230));
        const sleigh = document.createElement('div');
        sleigh.className = 'mtSleigh';
        sleigh.innerHTML = SLEIGH_SVG;
        sleigh.style.width = `${size}px`;
        layer.appendChild(sleigh);

        // The artwork faces left; mirror it when flying to the right.
        const toRight = Math.random() < 0.5;
        const flip = toRight ? -1 : 1;
        const x0 = toRight ? -size * 1.2 : width + size * 0.2;
        const x1 = toRight ? width + size * 0.2 : -size * 1.2;
        const y0 = random(0.05, 0.3) * height;
        const rise = random(-0.12, 0.08) * height;
        const steps = 20;
        const keyframes: Keyframe[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x0 + (x1 - x0) * t;
            // A gentle arc with a soft bob from the galloping reindeer.
            const y = y0 + rise * t - Math.sin(t * Math.PI) * height * 0.06 + Math.sin(t * Math.PI * 6) * 4;
            keyframes.push({
                transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scaleX(${flip}) rotate(${(-rise / height * 12).toFixed(1)}deg)`
            });
        }
        current = sleigh.animate(keyframes, {
            duration: (width / random(120, 170)) * 1000,
            easing: 'linear',
            fill: 'both'
        });
        const finish = () => {
            current = null;
            sleigh.remove();
        };
        current.onfinish = finish;
        current.oncancel = finish;
    };

    const schedule = (delay: number) => {
        timer = window.setTimeout(() => {
            fly();
            schedule(random(45000, 95000));
        }, delay);
    };
    schedule(random(8000, 16000));

    return () => {
        window.clearTimeout(timer);
        current?.cancel();
    };
};

const SNOWCAP_SVG = `
<svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="mtSnowcapFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".7" stop-color="#eef6ff"/>
      <stop offset="1" stop-color="#cfe3f7"/>
    </linearGradient>
  </defs>
  <path class="mtIcicles" d="M29 17l4 21 4-20zM72 20l3 14 3-13zM116 17l4 23 4-22zM155 18l3 13 3-12zM176 16l3 17 3-16z"/>
  <path fill="url(#mtSnowcapFill)" d="M0 0h200v15c-8 7-16 9-22 4-7 9-18 10-25 3-6 6-15 7-21 1-9 8-21 9-28 1-6 5-14 6-19 1-8 7-19 8-26 0-7 6-17 7-23 0-6 4-11 4-16 0-5 6-11 8-20 3z"/>
</svg>`;

const BAUBLE_COLORS = [
    ['#e8394a', '#8f1020'],
    ['#f2c14e', '#a26b08'],
    ['#2fb5a2', '#0f5d55'],
    ['#4f7cf0', '#1f3a8f'],
    ['#c45be6', '#5d1f7a']
];

const baubleSvg = (light: string, dark: string, id: string) => `
<svg viewBox="0 0 40 150" aria-hidden="true">
  <defs>
    <radialGradient id="${id}" cx="38%" cy="34%" r="70%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset=".18" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </radialGradient>
  </defs>
  <path class="mtBaubleRibbon" d="M20 0V112"/>
  <rect class="mtBaubleCap" x="15.5" y="110" width="9" height="7" rx="1.5"/>
  <circle cx="20" cy="132" r="17" fill="url(#${id})"/>
  <path class="mtBaubleBand" d="M4.5 128c10 4 21 4 31 0M3.5 135c11 4 22 4 33 0"/>
  <path class="mtBaubleGlint" d="M10 124l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"/>
</svg>`;

const GIFT_COLORS = [
    ['#d42f3f', '#f6d36b'],
    ['#2c8a5a', '#f2f2f2'],
    ['#3b5bd6', '#f6d36b'],
    ['#7b3fbf', '#ffd4ef']
];

const giftSvg = (box: string, ribbon: string) => `
<svg viewBox="0 0 64 60" aria-hidden="true">
  <path fill="${ribbon}" d="M32 17c-6-9-18-12-20-5-2 6 9 8 20 5zM32 17c6-9 18-12 20-5 2 6-9 8-20 5z"/>
  <rect x="8" y="22" width="48" height="38" rx="3" fill="${box}"/>
  <rect x="5" y="16" width="54" height="10" rx="2.5" fill="${box}"/>
  <rect x="5" y="16" width="54" height="10" rx="2.5" fill="#fff" opacity=".14"/>
  <rect x="28.5" y="16" width="7" height="44" fill="${ribbon}"/>
  <rect x="8" y="22" width="48" height="3" fill="#000" opacity=".18"/>
</svg>`;

let gradientCounter = 0;

const createChristmasDecoration = (kind: string) => {
    const decor = document.createElement('div');
    decor.className = `${DECOR_CLASS} mtChristmasDecor mtChristmasDecor-${kind}`;
    decor.setAttribute('aria-hidden', 'true');
    decor.style.setProperty('--mt-decor-delay', `${(-Math.random() * 8).toFixed(2)}s`);
    if (kind === 'bauble') {
        const [light, dark] = BAUBLE_COLORS[Math.floor(Math.random() * BAUBLE_COLORS.length)];
        // Unique id: the gradient differs per bauble colour.
        decor.innerHTML = baubleSvg(light, dark, `mtBauble${gradientCounter++}`);
        decor.style.setProperty('--mt-bauble-drop', `${Math.round(random(-34, -6))}%`);
        decor.style.left = `${Math.round(random(10, 26))}%`;
    } else if (kind === 'gift') {
        const [box, ribbon] = GIFT_COLORS[Math.floor(Math.random() * GIFT_COLORS.length)];
        decor.innerHTML = giftSvg(box, ribbon);
    } else {
        decor.innerHTML = SNOWCAP_SVG;
    }
    return decor;
};

export const christmasDecorations: DecorSet = {
    kinds: ['snowcap', 'bauble', 'gift'],
    heroKinds: ['snowcap', 'bauble'],
    create: createChristmasDecoration
};
