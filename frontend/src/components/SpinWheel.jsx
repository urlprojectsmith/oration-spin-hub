import { Maximize2, Music, Music2, RotateCw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEffect, useMemo, useRef, useState } from 'react';

const palette = ['#28e8ff', '#ff2bd6', '#ffe45c', '#7c5cff', '#31ff9a', '#ff784f', '#00a3ff', '#ff407d'];

function playDrumRoll() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.value = 0.05;

  let tick = 0;
  const timer = setInterval(() => {
    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 120 + Math.random() * 90;
    osc.connect(gain);
    osc.start();
    osc.stop(context.currentTime + 0.04);
    tick += 1;
    if (tick > 42) {
      clearInterval(timer);
      setTimeout(() => context.close(), 400);
    }
  }, 70);
}

function blastConfetti() {
  const end = Date.now() + 1600;
  const colors = ['#28e8ff', '#ff2bd6', '#ffe45c', '#31ff9a'];
  const frame = () => {
    confetti({ particleCount: 7, angle: 60, spread: 70, origin: { x: 0 }, colors });
    confetti({ particleCount: 7, angle: 120, spread: 70, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export default function SpinWheel({ names, onSpin, mode = 'speaker', title, spinToken = 0, actionLabel = 'Spin Now' }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [winner, setWinner] = useState(null);
  const [sound, setSound] = useState(true);
  const stageRef = useRef(null);
  const mountedRef = useRef(false);

  const segments = useMemo(() => names.length ? names : ['Add employees'], [names]);
  const gradient = segments
    .map((_, index) => {
      const start = (index / segments.length) * 100;
      const end = ((index + 1) / segments.length) * 100;
      return `${palette[index % palette.length]} ${start}% ${end}%`;
    })
    .join(', ');

  async function handleSpin() {
    if (spinning) return;
    setWinner(null);
    setCountdown(3);
    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    setCountdown(null);
    setSpinning(true);
    if (sound) playDrumRoll();
    const target = rotation + 1800 + Math.floor(Math.random() * 720);
    setRotation(target);

    try {
      const result = await onSpin();
      const picked = result?.winner || result?.winners?.[0] || result?.winner?.label;
      setTimeout(() => {
        setWinner(picked);
        setSpinning(false);
        blastConfetti();
      }, 3300);
    } catch (error) {
      setSpinning(false);
      setWinner({ employee_name: 'Spin failed', email: error.message, label: 'Spin failed' });
    }
  }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (spinToken) handleSpin();
  }, [spinToken]);

  function enterFullscreen() {
    stageRef.current?.requestFullscreen?.();
  }

  return (
    <section className={`wheel-stage ${mode}`} ref={stageRef}>
      <div className="wheel-toolbar">
        <div>
          <span className="kicker">{mode} mode</span>
          <h2>{title}</h2>
        </div>
        <div className="toolbar-buttons">
          <button className="icon-btn" title="Toggle sound" onClick={() => setSound((value) => !value)}>
            {sound ? <Music2 size={18} /> : <Music size={18} />}
          </button>
          <button className="icon-btn" title="Fullscreen" onClick={enterFullscreen}>
            <Maximize2 size={18} />
          </button>
        </div>
      </div>

      <div className="wheel-wrap">
        <div className="pointer" />
        <div
          className="wheel"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${rotation}deg)`
          }}
        >
          {segments.slice(0, 24).map((name, index) => (
            <span
              key={`${name}-${index}`}
              className="wheel-label"
              style={{
                transform: `rotate(${(360 / segments.length) * index + 360 / segments.length / 2}deg) translate(38%) rotate(90deg)`
              }}
            >
              {String(name).slice(0, 18)}
            </span>
          ))}
          <div className="wheel-core">
            <Trophy size={42} />
          </div>
        </div>
      </div>

      {countdown ? <div className="countdown">{countdown}</div> : null}

      <button className="spin-button" onClick={handleSpin} disabled={spinning || segments[0] === 'Add employees'}>
        <RotateCw size={22} />
        {spinning ? 'Spinning...' : actionLabel}
      </button>

      {winner ? (
        <div className="winner-card">
          <span>Winner</span>
          <strong>{winner.employee_name || winner.label || winner.winner_name}</strong>
          <small>{winner.email || winner.winner_email}</small>
        </div>
      ) : null}
    </section>
  );
}
