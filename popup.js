/**
 * @typedef {Object} HeaderConfig
 * @property {string} value - 请求头值；空字符串表示在请求时移除该请求头。
 * @property {boolean} enabled - 是否启用该请求头。
 */

/** @type {Record<string, HeaderConfig>} 自定义请求头：name -> { value, enabled } */
const customHeaders = {};

/**
 * 按 ID 获取 DOM 元素。
 * @param {string} id - 元素 ID。
 * @returns {HTMLElement} 对应的 DOM 元素。
 */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const headerNameInput = $('headerName');
const headerValueInput = $('headerValue');
const headersList = $('headersList');
const headerCount = $('headerCount');

/** declarativeNetRequest 需要匹配的资源类型（尽量全覆盖） */
const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
  'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
];

/** 删除图标（内联 SVG） */
const DELETE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// —— 事件绑定 ——
$('addHeaderBtn').addEventListener('click', addHeader);
[headerNameInput, headerValueInput].forEach((el) => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addHeader();
    }
  });
});

// 列表使用事件委托，避免每次 render 重新绑定监听
headersList.addEventListener('change', (e) => {
  const name = e.target.dataset?.name;
  if (e.target.dataset?.action === 'toggle' && name) {
    toggleHeader(name);
  }
});

headersList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete"]');
  if (btn?.dataset.name) {
    deleteHeader(btn.dataset.name);
  }
});

/**
 * 添加或覆盖一个自定义请求头。
 * 读取输入框内容，校验名称非空后写入内存并持久化，随后清空输入框。
 * @returns {void}
 */
function addHeader() {
  const name = headerNameInput.value.trim();
  const value = headerValueInput.value.trim();

  if (!name) {
    showTooltip(headerNameInput, '请输入请求头名称');
    headerNameInput.focus();
    return;
  }

  customHeaders[name] = { value, enabled: true };
  headerNameInput.value = '';
  headerValueInput.value = '';
  headerNameInput.focus();
  persist();
}

/**
 * 将当前配置写入 storage.local，并同步 DNR 规则与列表 UI。
 * @returns {Promise<void>}
 */
async function saveData() {
  await chrome.storage.local.set({ customHeaders });
  await updateRules();
  renderHeaders();
}

/**
 * 持久化当前配置并统一处理异常（避免各调用处重复写 .catch）。
 * @returns {void}
 */
function persist() {
  saveData().catch((err) => console.error('保存配置失败：', err));
}

/**
 * 从 storage.local 恢复已保存的请求头配置，并初始化 UI 与 DNR 规则。
 * @returns {Promise<void>}
 */
async function loadData() {
  const { customHeaders: stored } = await chrome.storage.local.get('customHeaders');
  Object.assign(customHeaders, stored || {});
  renderHeaders();
  await updateRules();
}

/**
 * 渲染已配置请求头列表，并更新启用数量徽章。
 * @returns {void}
 */
function renderHeaders() {
  const entries = Object.entries(customHeaders);
  const enabledCount = entries.reduce((n, [, h]) => n + (h.enabled ? 1 : 0), 0);

  headerCount.textContent = String(enabledCount);
  headerCount.classList.toggle('active', enabledCount > 0);

  if (!entries.length) {
    headersList.innerHTML = '<p class="empty-state">暂无自定义请求头</p>';
    return;
  }

  headersList.innerHTML = entries
    .map(([name, h]) => {
      const safeName = escapeHtml(name);
      // data-name 使用转义后的 safeName；浏览器解析 HTML 时会还原实体，
      // 因此事件委托里 dataset.name 读回的仍是原始名称，可直接作为 customHeaders 的键
      // 无 value 时标记为「删除」（请求时 remove 该头）
      const valueHtml = h.value
        ? `<span class="separator">:</span><span class="value" title="${escapeHtml(h.value)}">${escapeHtml(h.value)}</span>`
        : `<span class="separator">:</span><span class="remove-tag" title="该请求头将被移除">删 除</span>`;

      return `
      <div class="header-item${h.enabled ? '' : ' disabled'}">
        <div class="header-info">
          <span class="name" title="${safeName}">${safeName}</span>${valueHtml}
        </div>
        <div class="header-actions">
          <label class="toggle" title="启用/禁用">
            <input type="checkbox" data-action="toggle" data-name="${safeName}"${h.enabled ? ' checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="icon-btn delete" data-action="delete" data-name="${safeName}" title="删除">${DELETE_ICON}</button>
        </div>
      </div>`;
    })
    .join('');
}

/**
 * 切换指定请求头的启用状态并持久化。
 * @param {string} name - 请求头名称。
 * @returns {void}
 */
function toggleHeader(name) {
  if (!customHeaders[name]) return;
  customHeaders[name].enabled = !customHeaders[name].enabled;
  persist();
}

/**
 * 删除指定请求头并持久化。
 * @param {string} name - 请求头名称。
 * @returns {void}
 */
function deleteHeader(name) {
  delete customHeaders[name];
  persist();
}

/**
 * 根据当前启用的请求头同步 declarativeNetRequest 动态规则。
 * 每次先清空全部旧规则，再写入当前启用的规则（有值 set，无值 remove）。
 * @returns {Promise<void>}
 */
async function updateRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const enabled = Object.entries(customHeaders).filter(([, h]) => h.enabled);
  if (!enabled.length) {
    if (removeRuleIds.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    }
    return;
  }

  // 先清空全部旧规则（removeRuleIds 取所有已存在 id），再以 1..n 重新写入，
  // 避免 set/remove 切换导致规则 id 漂移或残留
  const addRules = enabled.map(([name, h], i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [buildHeaderOperation(name, h.value)]
    },
    condition: { urlFilter: '*', resourceTypes: RESOURCE_TYPES }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

/**
 * 构造 declarativeNetRequest 的单个请求头修改动作。
 * 有值则 set，无值则 remove。
 * @param {string} name - 请求头名称。
 * @param {string} value - 请求头值；为空表示移除。
 * @returns {{ header: string, operation: string, value?: string }} 请求头操作描述。
 */
function buildHeaderOperation(name, value) {
  return value
    ? { header: name, operation: 'set', value }
    : { header: name, operation: 'remove' };
}

/**
 * 转义字符串中的 HTML 特殊字符，防止其注入到 innerHTML。
 * @param {string} str - 待转义字符串。
 * @returns {string} 转义后的安全字符串。
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 在指定元素下方显示一条短暂消失的提示信息。
 * @param {HTMLElement} element - 参照定位的元素。
 * @param {string} message - 提示文本。
 * @returns {void}
 */
function showTooltip(element, message) {
  document.querySelector('.tooltip')?.remove();

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip show';
  tooltip.textContent = message;
  document.body.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + 6 + window.scrollY}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  setTimeout(() => {
    tooltip.classList.remove('show');
    setTimeout(() => tooltip.remove(), 200);
  }, 2000);
}

loadData().catch((err) => console.error('初始化失败：', err));
