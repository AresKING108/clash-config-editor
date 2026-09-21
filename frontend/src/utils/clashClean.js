// Clash 配置清洗工具
// 背景：mihomo proxy-groups 认的是 exclude-filter（关键词/正则字符串，反引号分隔），
// 不认 exclude 数组字段。编辑器 UI 的「剔除节点」直接填写关键词存到 exclude-filter。

// 保存前清洗完整配置：
// - proxy-groups 里删除残留的 exclude 数组字段（mihomo 不认，留着会被忽略且无意义）
// - exclude-filter 关键词字符串原样保留
// - 不改动其他任何字段
export function cleanConfigForSave(config) {
  const clean = JSON.parse(JSON.stringify(config || {}))
  if (clean['proxy-groups'] && Array.isArray(clean['proxy-groups'])) {
    clean['proxy-groups'] = clean['proxy-groups'].map((g) => {
      if (!g || typeof g !== 'object') return g
      if (Object.prototype.hasOwnProperty.call(g, 'exclude')) {
        const { exclude, ...rest } = g
        return rest
      }
      return g
    })
  }
  return clean
}