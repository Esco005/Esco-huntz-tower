'use strict';

// Telegram SDK работает внутри Mini App; в обычном браузере игра тоже запускается.
const webApp = window.Telegram?.WebApp;
if (webApp) {
  webApp.ready();
  webApp.expand();
}
const name = webApp?.initDataUnsafe?.user?.first_name || 'Гость';
document.getElementById('playerName').textContent = `Башня игрока ${name}`;

// Это локальная демоверсия. localStorage не защищён от изменения пользователем.
// Для реальных наград используйте серверное хранение и проверку Telegram initData.
const STORAGE_KEY = 'esco_tower_clicker_v1';
const KEY_INTERVAL = 60 * 60 * 1000;
const MAX_VISIBLE_BLOCKS = 7;
const $ = (id) => document.getElementById(id);
const defaults = () => ({ coins: 0, energy: 1000, maxEnergy: 1000, income: 1,
  keys: 0, blocks: 0, lastEnergyAt: Date.now(), lastKeyAt: Date.now() });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return defaults();
    const state = defaults();
    for (const key of ['coins','energy','maxEnergy','income','keys','blocks','lastEnergyAt','lastKeyAt']) {
      if (Number.isFinite(raw[key]) && raw[key] >= 0) state[key] = raw[key];
    }
    state.maxEnergy = Math.min(100000, Math.max(1000, Math.floor(state.maxEnergy)));
    state.energy = Math.min(state.maxEnergy, state.energy);
    state.income = Math.min(10000, Math.max(1, Math.floor(state.income)));
    return state;
  } catch { return defaults(); }
}
const state = load();
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// Восстановление энергии и выдача ключей по прошедшему времени.
// Один ключ каждый час, включая время, пока приложение закрыто.
function updateTimers() {
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(now - state.lastEnergyAt, 365 * 24 * 3600000));
  state.energy = Math.min(state.maxEnergy, state.energy + elapsed * 3 / 1000);
  state.lastEnergyAt = now;
  const keyElapsed = Math.max(0, now - state.lastKeyAt);
  const newKeys = Math.floor(keyElapsed / KEY_INTERVAL);
  if (newKeys > 0) {
    state.keys = Math.min(1000000, state.keys + newKeys);
    state.lastKeyAt += newKeys * KEY_INTERVAL;
  }
}

function render() {
  $('coins').textContent = Math.floor(state.coins).toLocaleString('ru-RU');
  $('keys').textContent = state.keys;
  $('chestKeys').textContent = state.keys;
  $('energyText').textContent = `${Math.floor(state.energy)} / ${state.maxEnergy}`;
  $('energyFill').style.width = `${100 * state.energy / state.maxEnergy}%`;
  $('tapButton').disabled = state.energy < 1;
  $('incomeText').textContent = `+${state.income}`;
  $('incomeLevel').textContent = `+${state.income}`;
  $('capacityText').textContent = state.maxEnergy;
  $('blocksText').textContent = state.blocks;
  $('buyIncome').disabled = state.coins < 100;
  $('buyCapacity').disabled = state.coins < 150;
  $('openChest').disabled = state.keys < 1;
  const remaining = Math.max(0, KEY_INTERVAL - (Date.now() - state.lastKeyAt));
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  $('keyTimer').textContent = `${mm}:${ss}`;
}

// Визуальные блоки не влияют на монеты; это анимация роста башни.
function createBlock() {
  const block = document.createElement('div');
  block.className = 'block';
  block.innerHTML = '<span class="ear left"></span><span class="ear right"></span><div class="bear"><span class="face">🐻</span></div>';
  const tower = $('tower');
  tower.append(block);
  while (tower.querySelectorAll('.block').length > MAX_VISIBLE_BLOCKS) {
    tower.querySelector('.block').remove();
  }
}
function rebuildTower() {
  for (let i = 0; i < Math.min(state.blocks, MAX_VISIBLE_BLOCKS); i++) createBlock();
}
function popup(x, y, amount) {
  const scene = $('scene');
  const rect = scene.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = `+${amount}`;
  el.style.left = `${Math.max(10, Math.min(rect.width - 60, x - rect.left))}px`;
  el.style.top = `${Math.max(10, Math.min(rect.height - 40, y - rect.top))}px`;
  $('popups').append(el);
  setTimeout(() => el.remove(), 700);
}
function tap(event) {
  updateTimers();
  if (state.energy < 1) { $('gameMessage').textContent = 'Энергия закончилась — подожди восстановления.'; render(); return; }
  state.energy -= 1;
  state.coins += state.income;
  state.blocks += 1;
  createBlock();
  const rect = $('scene').getBoundingClientRect();
  const x = event?.clientX ?? rect.left + rect.width / 2;
  const y = event?.clientY ?? rect.top + rect.height / 2;
  popup(x, y, state.income);
  try { webApp?.HapticFeedback?.impactOccurred('light'); } catch { /* Не все устройства поддерживают вибрацию. */ }
  $('gameMessage').textContent = 'Башня растёт!';
  save(); render();
}
$('tapButton').addEventListener('click', () => tap());
$('scene').addEventListener('click', tap);

// Улучшения: стоимость фиксированная, доход +1, ёмкость +50.
$('buyIncome').addEventListener('click', () => {
  if (state.coins < 100) return;
  state.coins -= 100; state.income += 1;
  $('boostMessage').textContent = 'Доход увеличен!'; save(); render();
});
$('buyCapacity').addEventListener('click', () => {
  if (state.coins < 150) return;
  state.coins -= 150; state.maxEnergy += 50;
  $('boostMessage').textContent = 'Максимальная энергия увеличена!'; save(); render();
});

// Сундук: случайная целая награда от 50 до 500 монет.
$('openChest').addEventListener('click', () => {
  updateTimers();
  if (state.keys < 1) { render(); return; }
  state.keys -= 1;
  const reward = 50 + Math.floor(Math.random() * 451);
  state.coins += reward;
  $('chestMessage').textContent = `🎉 В сундуке ${reward} монет!`;
  save(); render();
});

// Вкладки переключаются без перезагрузки.
document.querySelectorAll('.nav').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => { tab.hidden = true; tab.classList.remove('active'); });
    document.querySelectorAll('.nav').forEach(nav => nav.classList.remove('active'));
    $(button.dataset.tab).hidden = false;
    $(button.dataset.tab).classList.add('active');
    button.classList.add('active');
  });
});

updateTimers(); rebuildTower(); render(); save();
setInterval(() => { updateTimers(); render(); save(); }, 250);
