/* =========================================================
   TWL Control Tower — 다국어(i18n) 한/영/중
   [data-i18n] textContent, [data-i18n-html] innerHTML 치환.
   언어 저장: localStorage 'twl-lang'. 전환기: .lang-btn[data-lang]
   ========================================================= */
(function () {
  'use strict';
  var LANGS = ['ko', 'en', 'zh'];

  var T = {
    ko: {
      'nav.services': '서비스', 'nav.berth': '선석배정', 'nav.vessel': '선박 위치',
      'nav.cargo': '화물 추적', 'nav.route': '경로 분석', 'nav.status': '데이터 현황',
      'nav.contact': '문의', 'nav.cta': '도입 문의', 'auth.login': '로그인',
      'hero.h1': '항만·선석·운임 데이터,<br><span class="accent">한 화면에서 관리</span>합니다',
      'hero.sub': '태웅로직스는 해상·항공·복합운송과 CIS/철도, 프로젝트 물류까지 수행하는 종합물류기업입니다. 이 포털에서는 항만 혼잡도 <b>Port Insight</b>, 국내 터미널 <b>선석배정</b>, <b>선박 위치</b>·<b>운임지수</b>를 실데이터로 제공합니다.',
      'hero.cta1': 'Port Insight 살펴보기', 'hero.cta2': '선석배정 보기',
      'hero.note': 'IMF PortWatch <b id="heroPortCount">2,065</b>개 항만 네트워크 · 중점 모니터링 항만(Focus Port) 93개 매일 산출',
      'ls.pci': '종합 PCI (항만 혼잡도 지수)', 'ls.congested': '혼잡(CONGESTED) 항만',
      'ls.risk': '글로벌 리스크', 'ls.delay': '평균 접안 지연',
      'svc.title': '태웅로직스 사업 영역', 'svc.desc': '공식 홈페이지(www.e-tgl.com) 기준 실제 제공 서비스입니다.',
      'svc1.t': '해상 운송', 'svc1.d': '수출입 컨테이너 해상운송 포워딩. 전 세계 주요 항로 선복 확보와 스케줄 관리.',
      'svc2.t': '항공 운송', 'svc2.d': '긴급 화물·고부가 화물의 항공 수출입 운송 서비스.',
      'svc3.t': '복합 운송 · CIS/철도', 'svc3.d': '해상+철도 복합운송. CIS·러시아·중앙아시아 철도 운송 전문.',
      'svc4.t': 'ISO TANK · 프로젝트', 'svc4.d': '액체화물 ISO 탱크 운송과 중량물·플랜트 프로젝트 물류.', 'svc4.tag': '특수 화물',
      'svc5.t': '창고 · 내륙운송', 'svc5.d': '보관·재고관리와 내륙운송, 물류 컨설팅.',
      'svc6.t': '이커머스 물류', 'svc6.d': '이커머스 국제 물류 및 풀필먼트 지원.',
      'dig.title': '이 포털에서 바로 쓰는 대시보드', 'dig.desc': '아래는 전부 실데이터로 지금 동작하는 기능입니다.',
      'd1.d': 'IMF PortWatch(위성 AIS) 기반 주요 항만 93개 혼잡도 — PCI v2, 매일 산출.', 'd1.tag': '↳ 대시보드 열기',
      'd2.t': '선석배정 현황', 'd2.d': '부산·광양·인천 16개 터미널 선석배정, 매일 자동 수집. 반입마감 임박 강조.', 'd2.tag': '↳ 대시보드 열기',
      'd3.t': '선박 위치', 'd3.d': '항만 주변 선박 실시간 위치(AIS). 부산신항·북항·광양·인천 전환.', 'd3.tag': '↳ 지도 열기',
      'd4.t': '주간 운임지수', 'd4.d': 'SCFI·CCFI 종합/항로별 지수 — 상하이해운거래소 공표, 주간 자동 수집(상단 스트립).', 'd4.tag': '↳ 홈 상단 표시',
      'd5.t': '항만 기상', 'd5.d': '부산신항·광양·인천 파고/풍속 실황 — 선석배정 페이지 제공.', 'd5.tag': '↳ 기상 카드 보기',
      'd6.t': '데이터 현황', 'd6.d': '파이프라인 적재 현황·데이터 최신성·적재 이력 운영 보드.', 'd6.tag': '↳ 운영 보드 열기',
      'cta.title': '문의', 'cta.text': '모듈 구성·데이터 연동 관련 문의는 아래 메일로 부탁드립니다.', 'cta.btn': '이메일로 도입 문의',
      'foot.note': '태웅로직스 | 문의: itt@twsc.co.kr<br>항만 혼잡 지표: PCI(Port Congestion Index) — IMF PortWatch 오픈데이터 기반 TWL 자체 산출 · 선석배정: 각 터미널 공표 데이터<br>© <span class="footer-year">2026</span> TAEWOONG LOGISTICS. All rights reserved.',
    },
    en: {
      'nav.services': 'Services', 'nav.berth': 'Berth Plan', 'nav.vessel': 'Vessel',
      'nav.cargo': 'Cargo', 'nav.route': 'Route', 'nav.status': 'Data',
      'nav.contact': 'Contact', 'nav.cta': 'Contact Us', 'auth.login': 'Sign in',
      'hero.h1': 'Port, berth & freight data,<br><span class="accent">managed in one place</span>',
      'hero.sub': 'Taewoong Logistics is a total logistics company covering ocean, air, intermodal, CIS/rail and project cargo. This portal delivers real-time data for port congestion (<b>Port Insight</b>), domestic terminal <b>berth planning</b>, <b>vessel positions</b> and <b>freight indices</b>.',
      'hero.cta1': 'Explore Port Insight', 'hero.cta2': 'View Berth Plan',
      'hero.note': 'IMF PortWatch network of <b id="heroPortCount">2,065</b> ports · 93 Focus Ports computed daily',
      'ls.pci': 'Overall PCI (Port Congestion Index)', 'ls.congested': 'Congested Ports',
      'ls.risk': 'Global Risk', 'ls.delay': 'Avg Berthing Delay',
      'svc.title': 'Our Services', 'svc.desc': 'Actual services per our official site (www.e-tgl.com).',
      'svc1.t': 'Ocean Freight', 'svc1.d': 'Import/export container ocean forwarding. Global space booking and schedule management.',
      'svc2.t': 'Air Freight', 'svc2.d': 'Air import/export for urgent and high-value cargo.',
      'svc3.t': 'Intermodal · CIS/Rail', 'svc3.d': 'Sea-rail intermodal. Specialized in CIS, Russia and Central Asia rail transport.',
      'svc4.t': 'ISO Tank · Project', 'svc4.d': 'Liquid ISO tank transport and heavy/plant project logistics.', 'svc4.tag': 'Special Cargo',
      'svc5.t': 'Warehouse · Trucking', 'svc5.d': 'Storage, inventory management, inland trucking and logistics consulting.',
      'svc6.t': 'E-Commerce Logistics', 'svc6.d': 'Cross-border e-commerce logistics and fulfillment support.',
      'dig.title': 'Dashboards you can use right now', 'dig.desc': 'Everything below runs on real data today.',
      'd1.d': 'Congestion of 93 major ports via IMF PortWatch (satellite AIS) — PCI v2, computed daily.', 'd1.tag': '↳ Open dashboard',
      'd2.t': 'Berth Planning', 'd2.d': 'Berth plans for 16 terminals (Busan/Gwangyang/Incheon), auto-collected daily. Closing-time alerts.', 'd2.tag': '↳ Open dashboard',
      'd3.t': 'Vessel Positions', 'd3.d': 'Real-time vessel positions (AIS) around ports. Switch Busan New/North, Gwangyang, Incheon.', 'd3.tag': '↳ Open map',
      'd4.t': 'Weekly Freight Index', 'd4.d': 'SCFI·CCFI composite/lane indices — SSE published, weekly auto-collection (top strip).', 'd4.tag': '↳ Shown at top',
      'd5.t': 'Port Weather', 'd5.d': 'Wave/wind conditions for Busan New, Gwangyang, Incheon — on the berth page.', 'd5.tag': '↳ View weather',
      'd6.t': 'Data Status', 'd6.d': 'Pipeline load status, data freshness and load-history ops board.', 'd6.tag': '↳ Open board',
      'cta.title': 'Contact', 'cta.text': 'For module setup or data integration inquiries, please email us below.', 'cta.btn': 'Email us',
      'foot.note': 'Taewoong Logistics | Contact: itt@twsc.co.kr<br>Port congestion: PCI (Port Congestion Index) — computed by TWL on IMF PortWatch open data · Berth plans: each terminal\'s published data<br>© <span class="footer-year">2026</span> TAEWOONG LOGISTICS. All rights reserved.',
    },
    zh: {
      'nav.services': '服务', 'nav.berth': '泊位分配', 'nav.vessel': '船舶位置',
      'nav.cargo': '货物追踪', 'nav.route': '航线分析', 'nav.status': '数据状态',
      'nav.contact': '咨询', 'nav.cta': '联系咨询', 'auth.login': '登录',
      'hero.h1': '港口·泊位·运价数据，<br><span class="accent">一屏统一管理</span>',
      'hero.sub': '泰雄物流是涵盖海运、空运、多式联运、独联体/铁路及项目物流的综合物流企业。本门户以实时数据提供港口拥堵（<b>Port Insight</b>）、国内码头<b>泊位分配</b>、<b>船舶位置</b>及<b>运价指数</b>。',
      'hero.cta1': '查看 Port Insight', 'hero.cta2': '查看泊位分配',
      'hero.note': 'IMF PortWatch <b id="heroPortCount">2,065</b> 个港口网络 · 每日测算 93 个重点监测港口',
      'ls.pci': '综合 PCI（港口拥堵指数）', 'ls.congested': '拥堵港口',
      'ls.risk': '全球风险', 'ls.delay': '平均靠泊延误',
      'svc.title': '泰雄物流业务领域', 'svc.desc': '依据官网（www.e-tgl.com）实际提供的服务。',
      'svc1.t': '海运', 'svc1.d': '进出口集装箱海运货代。全球主要航线舱位保障与船期管理。',
      'svc2.t': '空运', 'svc2.d': '紧急货物·高附加值货物的空运进出口服务。',
      'svc3.t': '多式联运 · 独联体/铁路', 'svc3.d': '海运+铁路多式联运。专业承接独联体、俄罗斯及中亚铁路运输。',
      'svc4.t': 'ISO 罐箱 · 项目物流', 'svc4.d': '液体货物 ISO 罐箱运输及重大件·成套设备项目物流。', 'svc4.tag': '特种货物',
      'svc5.t': '仓储 · 内陆运输', 'svc5.d': '仓储·库存管理、内陆运输及物流咨询。',
      'svc6.t': '电商物流', 'svc6.d': '跨境电商国际物流及履约支持。',
      'dig.title': '门户内即用的仪表盘', 'dig.desc': '以下功能均以实时数据即时运行。',
      'd1.d': '基于 IMF PortWatch（卫星 AIS）的 93 个主要港口拥堵度 — PCI v2，每日测算。', 'd1.tag': '↳ 打开仪表盘',
      'd2.t': '泊位分配现况', 'd2.d': '釜山·光阳·仁川 16 个码头泊位分配，每日自动采集。临近截关高亮。', 'd2.tag': '↳ 打开仪表盘',
      'd3.t': '船舶位置', 'd3.d': '港口周边船舶实时位置（AIS）。可切换釜山新港·北港·光阳·仁川。', 'd3.tag': '↳ 打开地图',
      'd4.t': '每周运价指数', 'd4.d': 'SCFI·CCFI 综合/航线指数 — 上海航运交易所公布，每周自动采集（顶部条）。', 'd4.tag': '↳ 显示于顶部',
      'd5.t': '港口气象', 'd5.d': '釜山新港·光阳·仁川浪高/风速实况 — 泊位分配页提供。', 'd5.tag': '↳ 查看气象卡',
      'd6.t': '数据状态', 'd6.d': '管道加载状态·数据新鲜度·加载历史运营看板。', 'd6.tag': '↳ 打开看板',
      'cta.title': '咨询', 'cta.text': '关于模块配置·数据对接的咨询，请通过下方邮箱联系。', 'cta.btn': '邮件咨询',
      'foot.note': '泰雄物流 | 咨询: itt@twsc.co.kr<br>港口拥堵指标: PCI（Port Congestion Index） — 基于 IMF PortWatch 开放数据由 TWL 自行测算 · 泊位分配: 各码头公布数据<br>© <span class="footer-year">2026</span> TAEWOONG LOGISTICS. 版权所有。',
    },
  };

  function getLang() { try { var l = localStorage.getItem('twl-lang'); return LANGS.indexOf(l) >= 0 ? l : 'ko'; } catch (e) { return 'ko'; } }
  function saveLang(l) { try { localStorage.setItem('twl-lang', l); } catch (e) { /* */ } }

  function apply(l) {
    if (LANGS.indexOf(l) < 0) l = 'ko';
    var dict = T[l] || T.ko;
    document.documentElement.setAttribute('lang', l === 'zh' ? 'zh-CN' : l);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n'); if (dict[k] != null) el.textContent = dict[k];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html'); if (dict[k] != null) el.innerHTML = dict[k];
    });
    document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === l); });
  }

  window.TWI18N = {
    LANGS: LANGS, getLang: getLang,
    setLang: function (l) { saveLang(l); apply(l); },
    apply: apply,
  };

  function bindSwitch() {
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { window.TWI18N.setLang(b.getAttribute('data-lang')); });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(getLang()); bindSwitch(); });
  } else { apply(getLang()); bindSwitch(); }
})();
