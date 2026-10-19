import type { CameraPreset } from './scene';
import type { TowerRecord } from './types';

export interface UiCallbacks {
  onPreset: (preset: CameraPreset) => void;
  onReset: () => void;
  onRemoveSuitcase: () => void;
  onCutaway: (enabled: boolean) => void;
}

export interface UiApi {
  setStatus: (text: string) => void;
  toast: (text: string) => void;
  showTooltip: (text: string, x: number, y: number) => void;
  hideTooltip: () => void;
  setLoadingProgress: (fraction: number) => void;
  hideLoading: () => void;
  failLoading: (message: string) => void;
  setRemoveVisible: (visible: boolean) => void;
  setActivePreset: (preset: CameraPreset | null) => void;
  setCutaway: (enabled: boolean) => void;
  setLockerSize: (tower: TowerRecord) => void;
}

function query<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export function createUi(callbacks: UiCallbacks): UiApi {
  const status = query<HTMLDivElement>('#status');
  const toastElement = query<HTMLDivElement>('#toast');
  const tooltip = query<HTMLDivElement>('#tooltip');
  const loading = query<HTMLDivElement>('#loading');
  const loadingMessage = query<HTMLParagraphElement>('#loading-message');
  const loadingBar = query<HTMLDivElement>('#loading-bar');
  const removeButton = query<HTMLButtonElement>('#remove-suitcase');
  const cutawayButton = query<HTMLButtonElement>('#cutaway');
  const resetButton = query<HTMLButtonElement>('#reset');
  const sizeLocker = query<HTMLSpanElement>('#size-locker');
  const sizeTier = query<HTMLSpanElement>('#size-tier');
  const sizeModel = query<HTMLParagraphElement>('#size-model');
  const sizeCompartment = query<HTMLElement>('#size-compartment');
  const sizeVolume = query<HTMLElement>('#size-volume');
  const presetButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-preset]'),
  );

  let toastTimer: number | undefined;
  let cutawayEnabled = false;
  let shownSizeLabel: string | null = null;

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.dataset.preset as CameraPreset | undefined;
      if (!preset) return;
      callbacks.onPreset(preset);
      setActivePreset(preset);
    });
  });

  resetButton.addEventListener('click', callbacks.onReset);
  removeButton.addEventListener('click', callbacks.onRemoveSuitcase);

  cutawayButton.addEventListener('click', () => {
    cutawayEnabled = !cutawayEnabled;
    cutawayButton.classList.toggle('active', cutawayEnabled);
    cutawayButton.setAttribute('aria-pressed', String(cutawayEnabled));
    callbacks.onCutaway(cutawayEnabled);
  });

  function setStatus(text: string): void {
    status.textContent = text;
  }

  function toast(text: string): void {
    toastElement.textContent = text;
    toastElement.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastElement.classList.remove('visible');
    }, 2800);
  }

  function showTooltip(text: string, x: number, y: number): void {
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');

    const rect = tooltip.getBoundingClientRect();
    const offset = 16;
    let left = x + offset;
    let top = y + offset;

    if (left + rect.width > window.innerWidth - 12) {
      left = x - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight - 12) {
      top = y - rect.height - offset;
    }

    tooltip.style.left = `${Math.max(12, left)}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  }

  function hideTooltip(): void {
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  function setLoadingProgress(fraction: number): void {
    const percent = Math.max(2, Math.min(100, Math.round(fraction * 100)));
    loadingBar.style.width = `${percent}%`;
  }

  function hideLoading(): void {
    setLoadingProgress(1);
    loading.classList.add('is-hidden');
    window.setTimeout(() => {
      loading.hidden = true;
    }, 520);
  }

  function failLoading(message: string): void {
    loadingMessage.textContent = message;
    loadingBar.style.width = '100%';
    loadingBar.style.background = '#ff455e';
  }

  function setRemoveVisible(visible: boolean): void {
    removeButton.hidden = !visible;
  }

  function setActivePreset(preset: CameraPreset | null): void {
    presetButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.preset === preset);
    });
  }

  function setCutaway(enabled: boolean): void {
    cutawayEnabled = enabled;
    cutawayButton.classList.toggle('active', enabled);
    cutawayButton.setAttribute('aria-pressed', String(enabled));
  }

  function setLockerSize(tower: TowerRecord): void {
    if (tower.label === shownSizeLabel) return;
    shownSizeLabel = tower.label;

    const { size } = tower;
    sizeLocker.textContent = tower.label;
    sizeTier.textContent = size.tier;
    sizeModel.textContent = `${tower.model} · ${size.doorsPerTower} doors per tower`;
    sizeCompartment.textContent = `${size.compartment.height} × ${size.compartment.width} × ${size.compartment.depth} mm`;
    sizeVolume.textContent = `${size.volumeLitres} L`;
  }

  return {
    setStatus,
    toast,
    showTooltip,
    hideTooltip,
    setLoadingProgress,
    hideLoading,
    failLoading,
    setRemoveVisible,
    setActivePreset,
    setCutaway,
    setLockerSize,
  };
}
