const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btn = document.getElementById('transformBtn');
const message = document.getElementById('message');

let width, height;
let particles = [];
let mode = 'WANDER'; // 'WANDER', 'HEART'

// Reduced count for Line performance and cleaner look
const PARTICLE_COUNT = 2000;
const HEART_COUNT = 1200;

const MOUSE_RADIUS = 100;
const CONNECTION_DIST = 100; // Max distance for lines

// Physics constants (Even Slower)
const SPRING_STIFFNESS = 0.015; // Very soft spring
const FRICTION = 0.92;
const SCRAMBLE_SPEED = 6;
const WANDER_SPEED = 0.5; // Very slow wandering

// Mouse state
let mouse = { x: -1000, y: -1000 };
let scatterPulse = 0;
let isScrambling = false;
let scrambleTimer = null;

// Colors (No longer used directly for particles, but keeping for reference if needed)
// const colors = [
//     '#8A2BE2', // BlueViolet
//     '#9400D3', // DarkViolet
//     '#9932CC', // DarkOrchid
//     '#BA55D3', // MediumOrchid
//     '#DA70D6', // Orchid
//     '#D8BFD8', // Thistle
//     '#E6E6FA'  // Lavender
// ];

// Resize handler
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    if (mode === 'HEART') {
        calculateTargets();
    }
}
window.addEventListener('resize', resize);

// Mouse interactions
function updateMouse(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
}
window.addEventListener('mousemove', updateMouse);

// Touch interactions
window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
}, { passive: false });
window.addEventListener('touchstart', (e) => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    triggerPulse();
    startScramble();
}, { passive: false });
window.addEventListener('touchend', () => {
    mouse.x = -1000;
    mouse.y = -1000;
});

// Click interaction
window.addEventListener('mousedown', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    triggerPulse();
    startScramble();
});

function triggerPulse() {
    scatterPulse = 180;
}

function startScramble() {
    isScrambling = true;
    particles.forEach(p => {
        p.vx = (Math.random() - 0.5) * SCRAMBLE_SPEED * 2;
        p.vy = (Math.random() - 0.5) * SCRAMBLE_SPEED * 2;
    });
    if (scrambleTimer) clearTimeout(scrambleTimer);
    scrambleTimer = setTimeout(() => {
        isScrambling = false;
    }, 1200); // 1.2s scramble
}

class Particle {
    constructor() {
        this.reset();
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        // Random start hue (Purple range: 260 - 320)
        this.hue = 260 + Math.random() * 60;
        // Random hue speed (Slower fade)
        this.hueSpeed = 0.1 + Math.random() * 0.1;
        this.hueDir = Math.random() > 0.5 ? 1 : -1;
    }

    reset() {
        this.radius = Math.random() * 2 + 1;

        // Wandering velocity (Very Slow)
        this.vx = (Math.random() - 0.5) * WANDER_SPEED;
        this.vy = (Math.random() - 0.5) * WANDER_SPEED;

        this.targetX = null;
        this.targetY = null;
    }

    update() {
        // Color Fading
        this.hue += this.hueSpeed * this.hueDir;
        if (this.hue > 320 || this.hue < 260) {
            this.hueDir *= -1; // Bounce hue
        }

        // Pulse decay
        if (scatterPulse > 0) {
            scatterPulse *= 0.92;
            if (scatterPulse < 1) scatterPulse = 0;
        }

        const currentRadius = MOUSE_RADIUS + scatterPulse;

        // Calculate distance to mouse
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Mouse Scatter Force
        let forceX = 0;
        let forceY = 0;

        if (dist < currentRadius) {
            const force = (currentRadius - dist) / currentRadius;
            const angle = Math.atan2(dy, dx);
            const power = force * 1.5;

            forceX = Math.cos(angle) * power;
            forceY = Math.sin(angle) * power;
        }

        // --- Logic Branching ---

        let seekingTarget = false;
        if (!isScrambling && mode === 'HEART' && this.targetX !== null) {
            seekingTarget = true;
        }

        if (seekingTarget) {
            // Heart Mode: Seek Target
            const tdx = this.targetX - this.x;
            const tdy = this.targetY - this.y;

            const ax = tdx * SPRING_STIFFNESS;
            const ay = tdy * SPRING_STIFFNESS;

            this.vx += ax;
            this.vy += ay;
            this.vx *= FRICTION;
            this.vy *= FRICTION;

            // Simple Mouse interaction for heart particles
            this.vx -= forceX;
            this.vy -= forceY;

        } else {
            // Wandering / Background / Scramble

            // "Exclusion Zone" for Heart
            // If in heart mode and I have no target, stay away from center
            if (mode === 'HEART' && this.targetX === null && !isScrambling) {
                const cx = width / 2;
                const cy = height / 2;

                // Approximate heart radius ~ height/3
                // Using 0.35 * min_dim as boundary (Heart is approx 0.35 with new scale)
                const heartExclusionRadius = Math.min(width, height) * 0.38;

                const cdx = this.x - cx;
                const cdy = this.y - cy;
                const cDist = Math.sqrt(cdx * cdx + cdy * cdy);

                if (cDist < heartExclusionRadius) {
                    // Hard Barrier: Project to edge
                    const angle = Math.atan2(cdy, cdx);
                    this.x = cx + Math.cos(angle) * heartExclusionRadius;
                    this.y = cy + Math.sin(angle) * heartExclusionRadius;

                    // Reflect velocity to point outward
                    // Simple logic: if moving in, reverse.
                    // Dot product of Velocity and Normal (normal is cos(angle), sin(angle))
                    const nx = Math.cos(angle);
                    const ny = Math.sin(angle);
                    const dot = this.vx * nx + this.vy * ny;

                    if (dot < 0) {
                        // Moving inwards, reflect
                        this.vx = this.vx - 2 * dot * nx;
                        this.vy = this.vy - 2 * dot * ny;
                    }
                }
            }

            // Normal Mouse/Pulse force
            this.vx -= forceX;
            this.vy -= forceY;

            // Wall Bounce
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            if (this.x < 0) this.x = 0;
            if (this.x > width) this.x = width;
            if (this.y < 0) this.y = 0;
            if (this.y > height) this.y = height;
        }

        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${this.hue}, 70%, 60%)`;
        ctx.fill();
        ctx.closePath();
    }
}

function calculateTargets() {
    const cx = width / 2;
    const cy = height / 2;
    // Shrink heart slightly to make room for background particles
    const scale = Math.min(width, height) / 45;

    // Reset targets
    particles.forEach(p => {
        p.targetX = null;
        p.targetY = null;
    });

    // Only assign targets to first N particles
    for (let i = 0; i < HEART_COUNT; i++) {
        if (i >= particles.length) break;

        const t = (i / HEART_COUNT) * Math.PI * 2;
        let hx = 16 * Math.pow(Math.sin(t), 3);
        let hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

        particles[i].targetX = cx + (hx * scale) + (Math.random() - 0.5) * 20;
        particles[i].targetY = cy - (hy * scale) + (Math.random() - 0.5) * 20;
    }
}

function init() {
    resize();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
    }
    animate();
}

function animate() {
    ctx.clearRect(0, 0, width, height);

    // Update and Draw Particles
    particles.forEach(p => {
        p.update();
        p.draw();
    });

    // Draw Lines
    // OPTIMIZATION:
    // Only draw lines between BACKGROUND particles.
    // Heart particles (0 to HEART_COUNT-1) should NOT have lines.
    // Background particles are (HEART_COUNT to PARTICLE_COUNT-1).
    // We limit to a subset of BG particles for performance (e.g. first 300 BG particles).

    ctx.strokeStyle = 'rgba(186, 85, 211, 0.15)'; // Very faint purple
    ctx.lineWidth = 0.5;

    // Start from HEART_COUNT to pick only background particles
    const bgStartIndex = HEART_COUNT;
    const lineChecks = 300; // Check connections for this many background particles
    const loopEnd = Math.min(particles.length, bgStartIndex + lineChecks);

    for (let i = bgStartIndex; i < loopEnd; i++) {
        // Look ahead in the same group
        for (let j = i + 1; j < loopEnd; j++) {
            const p1 = particles[i];
            const p2 = particles[j];

            // Manhattan distance pre-check for speed (avoid sqrt)
            if (Math.abs(p1.x - p2.x) > CONNECTION_DIST || Math.abs(p1.y - p2.y) > CONNECTION_DIST) continue;

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < CONNECTION_DIST) {
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    requestAnimationFrame(animate);
}

// Interaction
btn.addEventListener('click', () => {
    mode = 'HEART';
    calculateTargets();
    btn.classList.add('hidden'); // Hide button
    message.classList.add('visible'); // Show message
});

init();
