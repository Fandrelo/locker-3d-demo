import * as THREE from 'three';

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawQrPattern(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const modules = 21;
  const module = size / modules;

  context.fillStyle = '#f3f8fd';
  roundedRect(context, x - 10, y - 10, size + 20, size + 20, 8);
  context.fill();

  const finder = (mx: number, my: number): boolean => {
    const corners = [
      [0, 0],
      [modules - 7, 0],
      [0, modules - 7],
    ];
    return corners.some(([fx, fy]) => {
      const dx = mx - fx;
      const dy = my - fy;
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
      const outer = dx === 0 || dy === 0 || dx === 6 || dy === 6;
      const inner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return outer || inner;
    });
  };

  context.fillStyle = '#081018';
  for (let my = 0; my < modules; my += 1) {
    for (let mx = 0; mx < modules; mx += 1) {
      const on = finder(mx, my)
        ? true
        : ((mx * 7 + my * 11 + mx * my * 3) % 7 < 3 && mx > 7 && my > 7);
      if (on) {
        context.fillRect(
          x + mx * module,
          y + my * module,
          Math.ceil(module),
          Math.ceil(module),
        );
      }
    }
  }
}

export function createKioskScreen(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create kiosk screen canvas');

  context.fillStyle = '#060b14';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#38bdf8';
  context.fillRect(0, 0, canvas.width, 8);
  context.fillRect(0, 716, canvas.width, 52);

  context.fillStyle = '#38bdf8';
  context.font = '700 15px "Segoe UI", sans-serif';
  context.letterSpacing = '4px';
  context.fillText('LOCKME FACILITY', 36, 48);

  context.fillStyle = '#f1f7fc';
  context.font = '700 38px "Segoe UI", sans-serif';
  context.fillText('SELF-SERVICE', 36, 102);
  context.fillText('LUGGAGE LOCKERS', 36, 144);

  context.fillStyle = '#8da2b8';
  context.font = '17px "Segoe UI", sans-serif';
  context.fillText('Secure storage in the station hall', 36, 178);

  context.fillStyle = '#0c1a2b';
  roundedRect(context, 36, 212, 440, 202, 18);
  context.fill();
  context.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = '#38bdf8';
  context.font = '700 14px "Segoe UI", sans-serif';
  context.fillText('SELECT A LOCKER', 58, 246);

  context.fillStyle = '#f1f7fc';
  context.font = '700 54px "Segoe UI", sans-serif';
  context.fillText('XXXL', 58, 302);

  context.fillStyle = '#9cb0c5';
  context.font = '16px "Segoe UI", sans-serif';
  context.fillText('Large compartment · 907 mm high', 58, 334);
  context.fillText('Fits a large suitcase and a cabin bag', 58, 358);

  context.fillStyle = '#38bdf8';
  context.font = '700 20px "Segoe UI", sans-serif';
  context.fillText('Q25.00', 58, 390);
  context.fillStyle = '#76a2c4';
  context.font = '14px "Segoe UI", sans-serif';
  context.fillText('per hour', 155, 390);

  const durations = [
    ['1 HOUR', 'Q25'],
    ['3 HOURS', 'Q60'],
    ['24 HOURS', 'Q90'],
  ];

  durations.forEach(([label, price], index) => {
    const x = 36 + index * 150;
    context.fillStyle = index === 0 ? '#12344a' : '#0d1c2b';
    roundedRect(context, x, 438, 140, 78, 14);
    context.fill();
    context.strokeStyle =
      index === 0 ? 'rgba(56, 189, 248, 0.8)' : 'rgba(56, 189, 248, 0.16)';
    context.stroke();

    context.fillStyle = index === 0 ? '#38bdf8' : '#c0d4e6';
    context.font = '700 13px "Segoe UI", sans-serif';
    context.fillText(label, x + 18, 466);

    context.fillStyle = '#f1f7fc';
    context.font = '700 24px "Segoe UI", sans-serif';
    context.fillText(price, x + 18, 498);
  });

  context.fillStyle = '#f1f7fc';
  context.font = '700 23px "Segoe UI", sans-serif';
  context.fillText('Scan to pay', 36, 570);

  context.fillStyle = '#8da2b8';
  context.font = '15px "Segoe UI", sans-serif';
  context.fillText('Open this QR code with your phone', 36, 596);
  context.fillText('to complete the booking.', 36, 618);

  drawQrPattern(context, 356, 548, 120);

  context.fillStyle = '#060b14';
  context.font = '700 22px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.fillText('TAP TO START', canvas.width / 2, 750);
  context.textAlign = 'start';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.93), material);
  screen.name = 'Kiosk_Touchscreen';
  screen.position.set(2.5, 1.3, -2.443);
  screen.renderOrder = 2;
  return screen;
}
