(() => {
  'use strict';

  const WIDTH = 800;
  const HEIGHT = 300;
  const GROUND_Y = 244;
  const DOUBLE_JUMP_TIME = 250;
  const DOUBLE_JUMP_INVULNERABILITY_SECONDS = 0.5;
  const PLAYER_ANIMATION_FRAME_COUNT = 4;
  const PLAYER_ANIMATION_FRAME_DURATION = 0.09;
  const MAX_SPEED = 540;
  const COLORS = {
    background: '#050816',
    backgroundDark: '#02030a',
    cyan: '#00f6ff',
    blue: '#008cff',
    purple: '#8a2be2',
    magenta: '#ff00aa',
    white: '#e8ffff',
    danger: '#ff3864'
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  class ScoreManager {
    constructor(scoreElement, highScoreElement) {
      this.scoreElement = scoreElement;
      this.highScoreElement = highScoreElement;
      this.score = 0;
      this.highScore = this.readHighScore();
      this.render();
    }

    readHighScore() {
      try {
        return Number.parseInt(localStorage.getItem('neon-runner-high-score') || '0', 10) || 0;
      } catch {
        return 0;
      }
    }

    reset() {
      this.score = 0;
      this.render();
    }

    update(deltaTime) {
      this.score += deltaTime * 100;
      this.render();
    }

    saveHighScore() {
      const roundedScore = Math.floor(this.score);
      if (roundedScore > this.highScore) {
        this.highScore = roundedScore;
        try {
          localStorage.setItem('neon-runner-high-score', String(this.highScore));
        } catch {
          // The game remains playable when storage is unavailable.
        }
      }
      this.render();
    }

    format(value) {
      return String(Math.floor(value)).padStart(6, '0');
    }

    render() {
      this.scoreElement.textContent = this.format(this.score);
      this.highScoreElement.textContent = this.format(this.highScore);
    }
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
    }

    emit(x, y, color, amount = 8, speed = 150) {
      for (let index = 0; index < amount; index += 1) {
        const angle = random(-Math.PI, Math.PI);
        const velocity = random(speed * 0.35, speed);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: random(0.18, 0.55),
          maxLife: 0,
          size: random(1, 3),
          color
        });
        this.particles[this.particles.length - 1].maxLife = this.particles[this.particles.length - 1].life;
      }
    }

    update(deltaTime) {
      for (const particle of this.particles) {
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.vy += 90 * deltaTime;
        particle.life -= deltaTime;
      }
      this.particles = this.particles.filter(particle => particle.life > 0);
    }

    draw(context) {
      context.save();
      for (const particle of this.particles) {
        context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.fillStyle = particle.color;
        context.shadowColor = particle.color;
        context.shadowBlur = 10;
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      context.restore();
    }

    clear() {
      this.particles.length = 0;
    }
  }

  class SoundManager {
    constructor() {
      this.audioContext = null;
    }

    play(frequency, duration, type = 'sine', volume = 0.035) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioContext ||= new AudioContextClass();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
      } catch {
        // Audio is an optional enhancement.
      }
    }

    jump() { this.play(410, 0.11, 'triangle'); }
    doubleJump() { this.play(690, 0.16, 'sawtooth', 0.025); }
    crash() { this.play(115, 0.32, 'square', 0.045); }
    shoot() { this.play(780, 0.055, 'square', 0.018); }
    enemyShot() { this.play(260, 0.09, 'triangle', 0.018); }
    explode() { this.play(170, 0.2, 'sawtooth', 0.035); }
  }

  class Player {
    constructor(particles, sound) {
      this.particles = particles;
      this.sound = sound;
      this.x = 94;
      this.groundY = GROUND_Y;
      this.width = 52;
      this.standHeight = 45;
      this.duckHeight = 30;
      this.height = this.standHeight;
      this.sprite = new Image();
      this.sprite.onerror = () => console.error('Unable to load player sprite: 10-poses.png');
      this.sprite.src = '10-poses.png';
      this.vy = 0;
      this.gravity = 1550;
      this.jumpVelocity = -590;
      this.doubleJumpVelocity = -520;
      this.jumpCount = 0;
      this.hasDoubleJumped = false;
      this.invulnerabilityTime = 0;
      this.isCrouching = false;
      this.runTime = 0;
      this.isGrounded = true;
      this.isDead = false;
    }

    get isInvulnerable() {
      return this.invulnerabilityTime > 0;
    }

    get hitbox() {
      const hitboxHeight = this.isCrouching ? 22 : 36;
      return {
        x: this.x + 8,
        y: this.groundY - hitboxHeight,
        width: this.width - 15,
        height: hitboxHeight
      };
    }

    setCrouching(isCrouching) {
      this.isCrouching = isCrouching;
      this.height = isCrouching ? this.duckHeight : this.standHeight;
    }

    jump() {
      if (!this.isGrounded) return false;
      this.setCrouching(false);
      this.isGrounded = false;
      this.vy = this.jumpVelocity;
      this.jumpCount = 1;
      this.hasDoubleJumped = false;
      this.sound.jump();
      this.particles.emit(this.x + 18, this.groundY - 3, COLORS.cyan, 5, 75);
      return true;
    }

    doubleJump() {
      if (this.isGrounded || this.hasDoubleJumped || this.jumpCount !== 1) return false;
      this.setCrouching(false);
      this.vy = this.doubleJumpVelocity;
      this.jumpCount = 2;
      this.hasDoubleJumped = true;
      this.invulnerabilityTime = DOUBLE_JUMP_INVULNERABILITY_SECONDS;
      this.sound.doubleJump();
      this.particles.emit(this.x + this.width / 2, this.groundY - this.height / 2, COLORS.white, 12, 190);
      return true;
    }

    update(deltaTime, duckHeld) {
      this.runTime += deltaTime;
      this.invulnerabilityTime = Math.max(0, this.invulnerabilityTime - deltaTime);
      this.setCrouching(duckHeld);
      if (!this.isGrounded) {
        this.vy += this.gravity * deltaTime;
        this.groundY += this.vy * deltaTime;
        if (this.groundY >= GROUND_Y) {
          this.groundY = GROUND_Y;
          this.vy = 0;
          this.isGrounded = true;
          this.jumpCount = 0;
          this.hasDoubleJumped = false;
          this.particles.emit(this.x + 18, GROUND_Y - 2, COLORS.blue, 4, 48);
        }
      }
    }

    draw(context) {
      if (this.isDead) {
        this.drawPorkLeg(context);
        return;
      }

      const bob = this.isGrounded && !this.isCrouching ? Math.sin(this.runTime * 17) * 2.2 : 0;
      const bodyHeight = this.height;
      const top = this.groundY - bodyHeight + bob;

      context.save();
      if (this.invulnerabilityTime > 0) {
        context.save();
        context.globalAlpha = .55 + Math.sin(this.runTime * 18) * .2;
        context.strokeStyle = COLORS.cyan;
        context.fillStyle = 'rgba(0, 246, 255, .1)';
        context.shadowColor = COLORS.cyan;
        context.shadowBlur = 20;
        context.lineWidth = 2;
        const centerX = this.x + this.width / 2;
        const centerY = this.groundY - bodyHeight / 2 + bob;
        context.beginPath();
        context.moveTo(centerX - 31, centerY + 16);
        context.bezierCurveTo(centerX - 44, centerY + 14, centerX - 45, centerY - 3, centerX - 32, centerY - 8);
        context.bezierCurveTo(centerX - 36, centerY - 25, centerX - 15, centerY - 31, centerX - 5, centerY - 18);
        context.bezierCurveTo(centerX + 2, centerY - 37, centerX + 28, centerY - 33, centerX + 31, centerY - 13);
        context.bezierCurveTo(centerX + 49, centerY - 13, centerX + 49, centerY + 11, centerX + 34, centerY + 17);
        context.bezierCurveTo(centerX + 25, centerY + 32, centerX + 5, centerY + 31, centerX - 4, centerY + 23);
        context.bezierCurveTo(centerX - 16, centerY + 32, centerX - 33, centerY + 29, centerX - 31, centerY + 16);
        context.closePath();
        context.fill();
        context.stroke();
        context.restore();
      }
      if (this.sprite.complete && this.sprite.naturalWidth > 0) {
        const frameWidth = this.sprite.naturalWidth / PLAYER_ANIMATION_FRAME_COUNT;
        const frameIndex = Math.floor(this.runTime / PLAYER_ANIMATION_FRAME_DURATION) % PLAYER_ANIMATION_FRAME_COUNT;
        context.drawImage(this.sprite, frameIndex * frameWidth, 0, frameWidth, this.sprite.naturalHeight, this.x, top, this.width, bodyHeight);
      }
      context.restore();
    }

    drawPorkLeg(context) {
      const centerX = this.x + this.width / 2;
      const plateY = this.groundY - 3;

      context.save();
      context.fillStyle = 'rgba(0, 0, 0, .32)';
      context.beginPath();
      context.ellipse(centerX, plateY + 1, 34, 7, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#f6f8ff';
      context.strokeStyle = '#a9bed0';
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(centerX, plateY - 2, 33, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = '#d4e1eb';
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(centerX, plateY - 2, 26, 5, 0, 0, Math.PI * 2);
      context.stroke();

      context.lineCap = 'round';
      context.strokeStyle = '#f4e4d5';
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(centerX - 5, plateY - 12);
      context.lineTo(centerX - 17, plateY - 19);
      context.stroke();
      context.fillStyle = '#fff3e6';
      context.beginPath();
      context.arc(centerX - 19, plateY - 21, 4, 0, Math.PI * 2);
      context.arc(centerX - 15, plateY - 17, 4, 0, Math.PI * 2);
      context.fill();

      const meat = context.createRadialGradient(centerX + 5, plateY - 20, 2, centerX + 2, plateY - 12, 23);
      meat.addColorStop(0, '#f6a28c');
      meat.addColorStop(1, '#a93f52');
      context.fillStyle = meat;
      context.strokeStyle = '#7e293d';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(centerX - 10, plateY - 16);
      context.bezierCurveTo(centerX - 12, plateY - 26, centerX - 2, plateY - 31, centerX + 7, plateY - 26);
      context.bezierCurveTo(centerX + 23, plateY - 27, centerX + 27, plateY - 12, centerX + 16, plateY - 7);
      context.bezierCurveTo(centerX + 9, plateY - 3, centerX - 2, plateY - 6, centerX - 10, plateY - 16);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    reset() {
      this.groundY = GROUND_Y;
      this.height = this.standHeight;
      this.vy = 0;
      this.jumpCount = 0;
      this.hasDoubleJumped = false;
      this.invulnerabilityTime = 0;
      this.isCrouching = false;
      this.isGrounded = true;
      this.runTime = 0;
      this.isDead = false;
    }
  }

  class Obstacle {
    constructor(type, x) {
      this.type = type;
      this.x = x;
      this.age = random(0, Math.PI * 2);
      this.passed = false;
      const settings = {
        laser: { width: 23, height: 58, color: COLORS.cyan },
        spike: { width: 39, height: 32, color: COLORS.magenta },
        drone: { width: 48, height: 26, color: COLORS.purple },
        wall: { width: 28, height: 77, color: COLORS.blue }
      };
      Object.assign(this, settings[type]);
      this.baseY = type === 'drone' ? GROUND_Y - random(88, 132) : GROUND_Y - this.height;
      this.y = this.baseY;
      this.destroyed = false;
      this.shootTimer = type === 'drone' ? random(1.2, 1.8) : Infinity;
    }

    get hitbox() {
      if (this.type === 'drone') {
        return { x: this.x + 7, y: this.y + 5, width: this.width - 12, height: this.height - 8 };
      }
      if (this.type === 'spike') {
        return { x: this.x + 7, y: this.y + 9, width: this.width - 13, height: this.height - 9 };
      }
      if (this.type === 'wall') {
        return { x: this.x + 5, y: this.y + 4, width: this.width - 10, height: this.height - 4 };
      }
      return { x: this.x + 5, y: this.y + 5, width: this.width - 10, height: this.height - 6 };
    }

    update(deltaTime, speed) {
      const movementSpeed = this.type === 'drone' ? speed * 1.3 : speed;
      this.x -= movementSpeed * deltaTime;
      this.age += deltaTime;
      if (this.type === 'drone') this.y = this.baseY + Math.sin(this.age * 4) * 5;
    }

    draw(context) {
      context.save();
      context.shadowColor = this.color;
      context.shadowBlur = 15;
      context.lineWidth = 2;
      context.strokeStyle = this.color;
      context.fillStyle = 'rgba(8, 18, 38, .92)';

      if (this.type === 'laser') {
        context.fillRect(this.x + 4, this.y + 4, this.width - 8, this.height - 4);
        context.strokeRect(this.x + 4, this.y + 4, this.width - 8, this.height - 4);
        context.fillStyle = this.color;
        context.fillRect(this.x, this.y, this.width, 5);
        context.fillRect(this.x + 7, this.y + 13, 3, this.height - 19);
      } else if (this.type === 'spike') {
        context.beginPath();
        context.moveTo(this.x, GROUND_Y);
        context.lineTo(this.x + this.width * .52, this.y);
        context.lineTo(this.x + this.width, GROUND_Y);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(this.x + 10, GROUND_Y - 2);
        context.lineTo(this.x + this.width * .52, this.y + 10);
        context.lineTo(this.x + this.width - 9, GROUND_Y - 2);
        context.stroke();
      } else if (this.type === 'drone') {
        context.beginPath();
        context.moveTo(this.x + 7, this.y + 8);
        context.lineTo(this.x + 16, this.y + 2);
        context.lineTo(this.x + 36, this.y + 2);
        context.lineTo(this.x + 44, this.y + 10);
        context.lineTo(this.x + 38, this.y + 22);
        context.lineTo(this.x + 10, this.y + 22);
        context.closePath();
        context.fill();
        context.stroke();
        context.strokeStyle = COLORS.cyan;
        context.beginPath();
        context.moveTo(this.x, this.y + 5);
        context.lineTo(this.x + 12, this.y + 5);
        context.moveTo(this.x + 36, this.y + 5);
        context.lineTo(this.x + this.width, this.y + 5);
        context.stroke();
        context.fillStyle = COLORS.magenta;
        context.fillRect(this.x + 19, this.y + 10, 12, 3);
        context.fillStyle = COLORS.blue;
        context.fillRect(this.x + 13, this.y + 23, 4, 3);
        context.fillRect(this.x + 33, this.y + 23, 4, 3);
        context.fillStyle = COLORS.white;
        context.shadowColor = COLORS.cyan;
        context.shadowBlur = 9;
        context.fillRect(this.x + 1, this.y + 11, 8, 4);
      } else {
        context.fillRect(this.x + 3, this.y, this.width - 6, this.height);
        context.strokeRect(this.x + 3, this.y, this.width - 6, this.height);
        context.fillStyle = 'rgba(0, 140, 255, .3)';
        context.fillRect(this.x + 8, this.y + 6, this.width - 16, this.height - 12);
        context.strokeStyle = COLORS.magenta;
        context.beginPath();
        context.moveTo(this.x - 2, this.y + 8);
        context.lineTo(this.x + this.width + 2, this.y + 8);
        context.moveTo(this.x - 2, this.y + this.height - 8);
        context.lineTo(this.x + this.width + 2, this.y + this.height - 8);
        context.stroke();
      }
      context.restore();
    }
  }

  class Projectile {
    constructor(x, y, velocityX, velocityY, owner) {
      this.x = x;
      this.y = y;
      this.velocityX = velocityX;
      this.velocityY = velocityY;
      this.owner = owner;
      this.color = owner === 'player' ? COLORS.cyan : COLORS.danger;
      this.width = owner === 'player' ? 18 : 9;
      this.height = owner === 'player' ? 13 : 6;
      this.expired = false;
    }

    get hitbox() {
      return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    update(deltaTime) {
      this.x += this.velocityX * deltaTime;
      this.y += this.velocityY * deltaTime;
      if (this.x > WIDTH + 20 || this.x + this.width < -20 || this.y > HEIGHT + 20 || this.y + this.height < -20) {
        this.expired = true;
      }
    }

    draw(context) {
      context.save();
      if (this.owner === 'player') {
        context.fillStyle = '#f28e9f';
        context.strokeStyle = '#ffd6dd';
        context.lineWidth = 1;
        context.shadowColor = COLORS.magenta;
        context.shadowBlur = 13;
        context.beginPath();
        context.ellipse(this.x + this.width / 2, this.y + this.height / 2, this.width * .48, this.height * .46, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.shadowBlur = 0;
        context.fillStyle = '#8a3d4c';
        context.beginPath();
        context.ellipse(this.x + this.width * .36, this.y + this.height * .46, 1.5, 2.4, -.2, 0, Math.PI * 2);
        context.ellipse(this.x + this.width * .66, this.y + this.height * .46, 1.5, 2.4, .2, 0, Math.PI * 2);
        context.fill();
        context.restore();
        return;
      }
      context.fillStyle = this.color;
      context.shadowColor = this.color;
      context.shadowBlur = 13;
      context.beginPath();
      context.roundRect(this.x, this.y, this.width, this.height, this.height / 2);
      context.fill();
      context.restore();
    }
  }

  class CollisionManager {
    static intersects(first, second) {
      return first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y;
    }
  }

  class Background {
    constructor() {
      this.farOffset = 0;
      this.midOffset = 0;
      this.nearOffset = 0;
      this.time = 0;
      this.farBuildings = this.createBuildings(32, 55, 125, 55, 125);
      this.midBuildings = this.createBuildings(24, 35, 96, 75, 155);
      this.stars = Array.from({ length: 75 }, () => ({ x: random(0, WIDTH), y: random(15, 190), size: random(.5, 1.8), phase: random(0, 6) }));
    }

    createBuildings(count, minWidth, maxWidth, minHeight, maxHeight) {
      const buildings = [];
      let x = 0;
      for (let index = 0; index < count; index += 1) {
        const width = random(minWidth, maxWidth);
        buildings.push({ x, width, height: random(minHeight, maxHeight), seed: Math.random() });
        x += width + random(4, 15);
      }
      return { buildings, width: x };
    }

    update(deltaTime, speed, running) {
      this.time += deltaTime;
      if (!running) return;
      this.farOffset = (this.farOffset + speed * deltaTime * .12) % this.farBuildings.width;
      this.midOffset = (this.midOffset + speed * deltaTime * .32) % this.midBuildings.width;
      this.nearOffset = (this.nearOffset + speed * deltaTime) % 54;
    }

    draw(context) {
      const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, '#050817');
      sky.addColorStop(.72, '#101735');
      sky.addColorStop(1, '#08101d');
      context.fillStyle = sky;
      context.fillRect(0, 0, WIDTH, HEIGHT);

      const glow = context.createRadialGradient(590, 145, 8, 590, 145, 250);
      glow.addColorStop(0, 'rgba(138, 43, 226, .20)');
      glow.addColorStop(.42, 'rgba(0, 140, 255, .08)');
      glow.addColorStop(1, 'rgba(5, 8, 22, 0)');
      context.fillStyle = glow;
      context.fillRect(280, 0, 520, 230);

      for (const star of this.stars) {
        const flicker = .35 + .55 * (Math.sin(this.time * 1.8 + star.phase) + 1) / 2;
        context.fillStyle = `rgba(160, 235, 255, ${flicker})`;
        context.fillRect(star.x, star.y, star.size, star.size);
      }

      this.drawCityLayer(context, this.farBuildings, this.farOffset, 192, '#101b34', 'rgba(0, 140, 255, .28)', false);
      this.drawCityLayer(context, this.midBuildings, this.midOffset, 218, '#0a1428', 'rgba(0, 246, 255, .62)', true);
      this.drawScanLines(context);
      this.drawRoad(context);
      this.drawAirTrails(context);
    }

    drawCityLayer(context, layer, offset, baseline, color, lightColor, signs) {
      const totalWidth = layer.width;
      const start = -offset;
      context.save();
      context.fillStyle = color;
      context.strokeStyle = lightColor;
      context.lineWidth = 1;

      for (let repeat = -1; repeat < 2; repeat += 1) {
        for (let index = 0; index < layer.buildings.length; index += 1) {
          const building = layer.buildings[index];
          const x = start + building.x + repeat * totalWidth;
          if (x + building.width < 0 || x > WIDTH) continue;
          const y = baseline - building.height;
          context.fillRect(x, y, building.width, building.height);
          context.strokeRect(x + .5, y + .5, building.width - 1, building.height - 1);
          context.fillStyle = 'rgba(0, 246, 255, .28)';
          for (let windowY = y + 12; windowY < baseline - 6; windowY += 16) {
            for (let windowX = x + 7; windowX < x + building.width - 5; windowX += 13) {
              if ((Math.floor(windowX + windowY + building.seed * 20) % 3) !== 0) {
                context.fillRect(windowX, windowY, 3, 5);
              }
            }
          }
          context.fillStyle = color;
          if (signs && building.width > 52 && index % 4 === 1) {
            context.shadowColor = index % 2 ? COLORS.cyan : COLORS.magenta;
            context.shadowBlur = 9;
            context.strokeStyle = index % 2 ? COLORS.cyan : COLORS.magenta;
            context.strokeRect(x + 9, y + 21, Math.min(24, building.width - 18), 9);
            context.shadowBlur = 0;
          }
          context.strokeStyle = lightColor;
        }
      }
      context.restore();
    }

    drawScanLines(context) {
      context.save();
      context.strokeStyle = 'rgba(71, 132, 170, .075)';
      context.lineWidth = 1;
      for (let y = 0; y < GROUND_Y - 15; y += 5) {
        context.beginPath();
        context.moveTo(0, y + .5);
        context.lineTo(WIDTH, y + .5);
        context.stroke();
      }
      context.restore();
    }

    drawRoad(context) {
      const road = context.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
      road.addColorStop(0, '#09172a');
      road.addColorStop(.15, '#06101f');
      road.addColorStop(1, '#02040c');
      context.fillStyle = road;
      context.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

      context.save();
      context.shadowColor = COLORS.cyan;
      context.shadowBlur = 13;
      context.strokeStyle = COLORS.cyan;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, GROUND_Y + 1);
      context.lineTo(WIDTH, GROUND_Y + 1);
      context.stroke();
      context.restore();

      context.save();
      context.strokeStyle = 'rgba(0, 246, 255, .25)';
      context.lineWidth = 1;
      const vanishingX = WIDTH * .55;
      for (let x = -this.nearOffset; x <= WIDTH + 54; x += 54) {
        context.beginPath();
        context.moveTo(vanishingX + (x - vanishingX) * .12, GROUND_Y + 2);
        context.lineTo(x, HEIGHT);
        context.stroke();
      }
      for (let index = 0; index < 7; index += 1) {
        const progress = (index / 7 + (this.nearOffset / 54) / 7) % 1;
        const perspective = progress * progress;
        const y = GROUND_Y + 4 + perspective * (HEIGHT - GROUND_Y - 4);
        context.globalAlpha = .16 + progress * .38;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(WIDTH, y);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(255, 0, 170, .65)';
      context.beginPath();
      context.moveTo(0, GROUND_Y + 7);
      context.lineTo(42, GROUND_Y + 7);
      context.moveTo(WIDTH - 54, GROUND_Y + 7);
      context.lineTo(WIDTH, GROUND_Y + 7);
      context.stroke();
      context.restore();

      context.save();
      context.fillStyle = COLORS.cyan;
      for (let index = 0; index < 14; index += 1) {
        const x = (index * 83 - this.nearOffset * 2.5 + WIDTH) % WIDTH;
        context.globalAlpha = .22 + (index % 3) * .13;
        context.fillRect(x, GROUND_Y + 12 + (index % 3) * 12, 10 + (index % 4) * 4, 1);
      }
      context.restore();
    }

    drawAirTrails(context) {
      context.save();
      for (let index = 0; index < 4; index += 1) {
        const y = 44 + index * 29 + Math.sin(this.time * 1.4 + index) * 4;
        const start = (this.time * (36 + index * 11) + index * 181) % (WIDTH + 130) - 130;
        context.globalAlpha = .16 + index * .035;
        context.shadowColor = index % 2 ? COLORS.magenta : COLORS.cyan;
        context.shadowBlur = 8;
        context.strokeStyle = index % 2 ? COLORS.magenta : COLORS.cyan;
        context.beginPath();
        context.moveTo(start, y);
        context.lineTo(start + 82, y);
        context.lineTo(start + 97, y - 5);
        context.stroke();
      }
      context.restore();
    }

    reset() {
      this.farOffset = 0;
      this.midOffset = 0;
      this.nearOffset = 0;
      this.time = 0;
    }
  }

  class InputManager {
    constructor(game, canvas) {
      this.game = game;
      this.canvas = canvas;
      this.keys = new Set();
      this.touchDuck = false;
      this.touchFire = false;
      this.duckSuppressed = false;
      this.touchStart = null;
      this.lastSpaceTime = null;
      this.onKeyDown = event => this.handleKeyDown(event);
      this.onKeyUp = event => this.handleKeyUp(event);
      this.onBlur = () => this.clearHeldInputs();
      this.onPointerDown = event => this.handlePointerDown(event);
      this.onPointerUp = event => this.handlePointerUp(event);
      this.onPointerCancel = () => this.handlePointerCancel();
      this.onContextMenu = event => event.preventDefault();

      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('pointercancel', this.onPointerCancel);
      canvas.addEventListener('contextmenu', this.onContextMenu);

      document.getElementById('touch-jump').addEventListener('pointerdown', event => {
        event.preventDefault();
        this.pressSpace(performance.now());
      });
      const duckButton = document.getElementById('touch-duck');
      duckButton.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.touchDuck = true;
        duckButton.setPointerCapture(event.pointerId);
      });
      duckButton.addEventListener('pointerup', () => {
        this.touchDuck = false;
        this.duckSuppressed = false;
      });
      duckButton.addEventListener('pointercancel', () => {
        this.touchDuck = false;
        this.duckSuppressed = false;
      });
      duckButton.addEventListener('lostpointercapture', () => {
        this.touchDuck = false;
        this.duckSuppressed = false;
      });
      const shootButton = document.getElementById('touch-shoot');
      shootButton.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.touchFire = true;
        this.game.shoot();
        shootButton.setPointerCapture(event.pointerId);
      });
      shootButton.addEventListener('pointerup', () => { this.touchFire = false; });
      shootButton.addEventListener('pointercancel', () => { this.touchFire = false; });
      shootButton.addEventListener('lostpointercapture', () => { this.touchFire = false; });
      document.getElementById('restart-button').addEventListener('click', () => this.game.restart());
    }

    handleKeyDown(event) {
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.pressSpace(performance.now());
        return;
      }
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        this.keys.add('ArrowDown');
        return;
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        this.keys.add('ArrowRight');
        if (!event.repeat) this.game.shoot();
      }
    }

    handleKeyUp(event) {
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        this.keys.delete('ArrowDown');
        this.duckSuppressed = false;
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        this.keys.delete('ArrowRight');
      }
      if (event.code === 'Space') this.keys.delete('Space');
    }

    pressSpace(currentTime) {
      if (this.game.state === 'ready') {
        this.game.start();
        return;
      }
      if (this.game.state === 'gameover') {
        this.game.restart();
        return;
      }
      if (this.game.state !== 'running') return;

      const isDoubleTap = this.lastSpaceTime !== null && currentTime - this.lastSpaceTime <= DOUBLE_JUMP_TIME;
      this.lastSpaceTime = currentTime;
      if (this.game.player.isCrouching) {
        this.duckSuppressed = true;
        this.game.player.setCrouching(false);
      }
      if (this.game.player.isGrounded) {
        this.game.player.jump();
      } else if (isDoubleTap) {
        this.game.player.doubleJump();
      }
    }

    handlePointerDown(event) {
      if (event.target.closest('button')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.touchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      if (event.pointerType === 'touch') event.preventDefault();
    }

    handlePointerUp(event) {
      if (!this.touchStart || this.touchStart.pointerId !== event.pointerId) return;
      const deltaY = event.clientY - this.touchStart.y;
      if (deltaY > 28) {
        this.touchDuck = true;
        window.setTimeout(() => { this.touchDuck = false; }, 430);
      } else if (Math.abs(deltaY) < 22) {
        this.pressSpace(performance.now());
      }
      this.touchStart = null;
    }

    handlePointerCancel() {
      this.touchStart = null;
      this.touchDuck = false;
    }

    get duckHeld() {
      return !this.duckSuppressed && (this.keys.has('ArrowDown') || this.touchDuck);
    }

    get fireHeld() {
      return this.keys.has('ArrowRight') || this.touchFire;
    }

    resetSpaceTimer() {
      this.lastSpaceTime = null;
    }

    clearHeldInputs() {
      this.keys.clear();
      this.touchDuck = false;
      this.touchFire = false;
      this.duckSuppressed = false;
      this.touchStart = null;
      this.game.player.setCrouching(false);
    }
  }

  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.context = this.canvas.getContext('2d');
      this.scoreElement = document.getElementById('score-value');
      this.highScoreElement = document.getElementById('high-score-value');
      this.startOverlay = document.getElementById('start-overlay');
      this.gameoverOverlay = document.getElementById('gameover-overlay');
      this.finalScoreElement = document.getElementById('final-score');
      this.finalHighScoreElement = document.getElementById('final-high-score');
      this.particles = new ParticleSystem();
      this.sound = new SoundManager();
      this.player = new Player(this.particles, this.sound);
      this.background = new Background();
      this.score = new ScoreManager(this.scoreElement, this.highScoreElement);
      this.input = new InputManager(this, this.canvas);
      this.obstacles = [];
      this.projectiles = [];
      this.shootCooldown = 0;
      this.state = 'ready';
      this.elapsed = 0;
      this.speed = 300;
      this.spawnTimer = 1;
      this.lastFrameTime = 0;
      this.frameHandle = 0;
      this.loop = timestamp => this.frame(timestamp);
      this.frameHandle = requestAnimationFrame(this.loop);
    }

    start() {
      this.resetRun();
      this.state = 'running';
      this.startOverlay.classList.add('is-hidden');
      this.startOverlay.setAttribute('aria-hidden', 'true');
      this.gameoverOverlay.classList.add('is-hidden');
      this.gameoverOverlay.setAttribute('aria-hidden', 'true');
    }

    restart() {
      this.start();
    }

    resetRun() {
      this.player.reset();
      this.obstacles.length = 0;
      this.particles.clear();
      this.background.reset();
      this.score.reset();
      this.elapsed = 0;
      this.speed = 300;
      this.spawnTimer = 1;
      this.lastFrameTime = 0;
      this.input.resetSpaceTimer();
      this.input.keys.clear();
      this.input.touchDuck = false;
      this.input.touchFire = false;
      this.projectiles = [];
      this.shootCooldown = 0;
    }

    frame(timestamp) {
      const deltaTime = this.lastFrameTime ? Math.min((timestamp - this.lastFrameTime) / 1000, .05) : 0;
      this.lastFrameTime = timestamp;
      this.update(deltaTime);
      this.draw();
      this.frameHandle = requestAnimationFrame(this.loop);
    }

    update(deltaTime) {
      const running = this.state === 'running';
      this.background.update(deltaTime, this.speed, running);
      this.particles.update(deltaTime);
      if (!running) return;

      this.elapsed += deltaTime;
      this.speed = Math.min(MAX_SPEED, 300 + this.elapsed * 8.4);
      this.score.update(deltaTime);
      this.player.update(deltaTime, this.input.duckHeld);
      this.shootCooldown = Math.max(0, this.shootCooldown - deltaTime);
      if (this.input.fireHeld && this.shootCooldown <= 0) this.shoot();
      this.updateObstacles(deltaTime);
      this.updateProjectiles(deltaTime);
      this.resolveProjectileCollisions();
      if (this.state !== 'running') return;

      for (const obstacle of this.obstacles) {
        if (!this.player.isInvulnerable && !obstacle.destroyed && CollisionManager.intersects(this.player.hitbox, obstacle.hitbox)) {
          this.endRun();
          break;
        }
      }
    }

    updateObstacles(deltaTime) {
      this.spawnTimer -= deltaTime;
      if (this.spawnTimer <= 0) {
        this.spawnObstacle();
        const difficulty = clamp((this.speed - 300) / (MAX_SPEED - 300), 0, 1);
        this.spawnTimer = random(1.05, 1.65) - difficulty * .22;
      }
      for (const obstacle of this.obstacles) {
        obstacle.update(deltaTime, this.speed);
        if (obstacle.type === 'drone' && !obstacle.destroyed) {
          obstacle.shootTimer -= deltaTime;
          if (obstacle.shootTimer <= 0) {
            this.spawnEnemyProjectile(obstacle);
            const difficulty = clamp(this.elapsed / 45, 0, 1);
            const fireRateMultiplier = 1 + difficulty * 1.8;
            obstacle.shootTimer = random(1.3, 1.8) / fireRateMultiplier;
          }
        }
      }
      this.obstacles = this.obstacles.filter(obstacle => !obstacle.destroyed && obstacle.x + obstacle.width > -10);
    }

    shoot() {
      if (this.state !== 'running' || this.shootCooldown > 0) return false;
      const originX = this.player.x + this.player.width - 1;
      const originY = this.player.groundY - this.player.height * .58;
      this.projectiles.push(new Projectile(originX, originY, 600, 0, 'player'));
      this.shootCooldown = .18;
      this.sound.shoot();
      return true;
    }

    spawnEnemyProjectile(drone) {
      const difficulty = clamp(this.elapsed / 45, 0, 1);
      const projectileSpeed = 230 + difficulty * 250;
      const projectileY = drone.y + drone.height * .55;
      const playerHitbox = this.player.hitbox;
      const targetX = playerHitbox.x + playerHitbox.width / 2;
      const targetY = playerHitbox.y + playerHitbox.height / 2;
      const leftOriginX = drone.x + 3;
      const aimX = targetX - leftOriginX;
      const aimY = targetY - projectileY;
      const aimLength = Math.hypot(aimX, aimY) || 1;
      this.projectiles.push(new Projectile(drone.x + drone.width - 3, projectileY, projectileSpeed, 0, 'enemy'));
      this.projectiles.push(new Projectile(leftOriginX, projectileY, aimX / aimLength * projectileSpeed, aimY / aimLength * projectileSpeed, 'enemy'));
      this.sound.enemyShot();
    }

    updateProjectiles(deltaTime) {
      for (const projectile of this.projectiles) projectile.update(deltaTime);
    }

    resolveProjectileCollisions() {
      for (let firstIndex = 0; firstIndex < this.projectiles.length; firstIndex += 1) {
        const first = this.projectiles[firstIndex];
        if (first.expired) continue;
        for (let secondIndex = firstIndex + 1; secondIndex < this.projectiles.length; secondIndex += 1) {
          const second = this.projectiles[secondIndex];
          if (second.expired || first.owner === second.owner) continue;
          if (!CollisionManager.intersects(first.hitbox, second.hitbox)) continue;
          first.expired = true;
          second.expired = true;
          this.particles.emit((first.x + second.x) / 2, (first.y + second.y) / 2, COLORS.white, 8, 110);
          this.particles.emit((first.x + second.x) / 2, (first.y + second.y) / 2, COLORS.cyan, 5, 90);
          break;
        }
      }

      for (const projectile of this.projectiles) {
        if (projectile.expired || projectile.owner !== 'player') continue;
        for (const obstacle of this.obstacles) {
          if (obstacle.type !== 'drone' || obstacle.destroyed) continue;
          if (!CollisionManager.intersects(projectile.hitbox, obstacle.hitbox)) continue;
          obstacle.destroyed = true;
          projectile.expired = true;
          this.particles.emit(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2, COLORS.purple, 20, 210);
          this.particles.emit(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2, COLORS.cyan, 14, 165);
          this.sound.explode();
          break;
        }
      }

      for (const projectile of this.projectiles) {
        if (projectile.expired || projectile.owner !== 'enemy') continue;
        if (CollisionManager.intersects(projectile.hitbox, this.player.hitbox)) {
          projectile.expired = true;
          if (!this.player.isInvulnerable) {
            this.endRun();
            break;
          }
        }
      }
      this.projectiles = this.projectiles.filter(projectile => !projectile.expired);
    }

    spawnObstacle() {
      const types = ['laser', 'spike', 'drone', 'drone', 'drone', 'wall', 'wall'];
      const type = types[Math.floor(Math.random() * types.length)];
      this.obstacles.push(new Obstacle(type, WIDTH + 12));
    }

    endRun() {
      if (this.state !== 'running') return;
      this.state = 'gameover';
      this.player.isDead = true;
      this.score.saveHighScore();
      this.finalScoreElement.textContent = this.score.format(this.score.score);
      this.finalHighScoreElement.textContent = this.score.format(this.score.highScore);
      this.gameoverOverlay.classList.remove('is-hidden');
      this.gameoverOverlay.setAttribute('aria-hidden', 'false');
      this.input.resetSpaceTimer();
      this.sound.crash();
      this.particles.emit(this.player.x + 27, this.player.groundY - 22, COLORS.danger, 22, 230);
    }

    draw() {
      this.context.clearRect(0, 0, WIDTH, HEIGHT);
      this.background.draw(this.context);
      for (const obstacle of this.obstacles) obstacle.draw(this.context);
      for (const projectile of this.projectiles) projectile.draw(this.context);
      this.player.draw(this.context);
      this.particles.draw(this.context);
    }
  }

  const game = new Game();
  window.neonRunner = game;
})();
