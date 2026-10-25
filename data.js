window.TRIP = {
  meta: { start: '2026-11-02', end: '2026-11-11', rate: { vndPerTwd: 820, note: '測試匯率' } },
  places: {
    hkl: { name: '還劍湖', vn: 'Hồ Hoàn Kiếm', region: 'hanoi', addr: 'Hoàn Kiếm, Hà Nội', lat: 21.0287, lng: 105.8524 },
    vm: { name: '文廟', vn: 'Văn Miếu – Quốc Tử Giám', region: 'hanoi', addr: '58 P. Quốc Tử Giám, Hà Nội', lat: 21.0277, lng: 105.8355, hours: '08:00–17:00', price: '70,000 VND' },
    sapa: { name: '沙壩石教堂', vn: 'Nhà thờ đá Sa Pa', region: 'sapa', addr: 'Sa Pa, Lào Cai', lat: 22.3356, lng: 103.8430 },
  },
  overview: {
    nodes: [
      { id: 'hn', label: '河內', lat: 21.03, lng: 105.85, major: true },
      { id: 'han', label: '內排機場', lat: 21.22, lng: 105.80 },
      { id: 'lc', label: '老街', lat: 22.49, lng: 103.97, anchor: 'start' },
      { id: 'sp', label: '沙壩', lat: 22.336, lng: 103.84, major: true, anchor: 'end' },
      { id: 'nb', label: '寧平', lat: 20.25, lng: 105.90 },
    ],
    links: [
      { from: 'han', to: 'hn', kind: 'flight' }, { from: 'hn', to: 'lc', kind: 'train', bend: 10 }, { from: 'lc', to: 'sp', kind: 'car' },
      { from: 'sp', to: 'hn', kind: 'bus', bend: -20 }, { from: 'hn', to: 'nb', kind: 'car' },
    ],
    legs: [{ k: '河內 → 老街', v: '夜車約 8 小時' }],
  },
  days: [
    { id: '1102', date: '2026-11-02', dow: '一', city: '河內', title: '抵達河內・老城區散步', lead: '測試', facts: [{ k: '住宿', v: 'Sao Mai Boutique Hotel', status: 'booked' }],
      alerts: [{ kind: 'warn', title: '提醒', text: '測試提醒' }], route: { mode: 'walking', stops: ['hkl', 'vm'] },
      items: [{ time: '08:10', end: '10:30', type: 'flight', title: 'JX715 台北 → 河內', status: 'booked' }, { time: '14:00', type: 'sight', title: '還劍湖', status: 'suggest', unverified: true, places: ['hkl'], tip: '步行' }], food: ['f1'] },
    { id: '1103', date: '2026-11-03', dow: '二', city: '河內', title: '文廟', items: [{ time: '09:00', type: 'sight', title: '文廟', status: 'suggest', places: ['vm'] }] },
  ],
  food: [{ id: 'f1', region: 'hanoi', name: '測試河粉', vn: 'Phở Gia Truyền', addr: '49 Bát Đàn, Hà Nội', dish: '牛肉河粉', price: '60k', michelin: '米其林必比登' }],
  dishes: [{ region: 'hanoi', vn: 'Phở bò', zh: '牛肉河粉', desc: '測試' }],
  bookings: [{ when: '11/2', type: '航班', title: 'JX715', status: 'booked', next: '測試' }, { when: '11/8', type: '巴士', title: '夜巴', status: 'todo', next: '訂票' }],
  stays: [{ name: 'Sao Mai', dates: '11/2–11/3', status: 'booked', addr: 'x', place: 'hkl' }],
  budget: [{ id: 'b1', item: '住宿', status: 'todo', low: 500000, high: 1000000, per: 'person' }],
  checklist: [{ group: '證件', items: [{ id: 'c1', text: '護照', critical: true, note: '效期 6 個月' }] }],
  tips: [{ title: '安全', items: ['a', 'b'] }],
  contacts: [{ name: '警察', num: '113' }],
  phrases: [{ vn: 'Xin chào', zh: '你好' }],
};
