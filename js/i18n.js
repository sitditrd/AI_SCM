/* =========================================================
   TWL Control Tower — 다국어(i18n) 한/영/중  · 사이트 전역 엔진
   - [data-i18n] textContent, [data-i18n-html] innerHTML 치환
   - .site-nav / .footer-links 링크는 href 기준 자동 번역(페이지별 태깅 불필요)
   - 언어 스위처(.lang-switch)를 .header-actions 에 자동 주입(없을 때만)
   - JS 렌더러용 TWI18N.t(key) 제공 · 전환 시 'twl:langchange' 이벤트 발행
   - 언어 저장: localStorage 'twl-lang'
   ========================================================= */
(function () {
  'use strict';
  var LANGS = ['ko', 'en', 'zh'];

  var T = {
    ko: {
      /* --- 공통 네비/크롬 --- */
      'nav.home': '홈', 'nav.portinsight': 'Port Insight',
      'nav.services': '서비스', 'nav.berth': '선석배정', 'nav.vessel': '선박 위치',
      'nav.cargo': '화물 추적', 'nav.route': '경로 분석', 'nav.schedule': '해외 스케줄',
      'nav.status': '데이터 현황', 'nav.contact': '문의', 'nav.cta': '도입 문의',
      'auth.login': '로그인', 'auth.logout': '로그아웃', 'auth.admin': '회원 승인',
      'scope.dom': '국내', 'scope.ovs': '해외',
      /* 미로그인 게이트 / 관리자 전용 오버레이 */
      'gate.title': '로그인이 필요한 서비스입니다',
      'gate.body': '주요 기능은 로그인 후 이용하실 수 있습니다.<br>승인된 계정으로 로그인하거나 회원가입을 신청해 주세요.',
      'gate.cta': '로그인 / 회원가입', 'gate.home': '홈으로',
      'gate.toastSub': '<b>%s초</b> 후 주요 기능이 가려집니다 · 로그인 시 계속 이용',
      'admin.blockTitle': '관리자 전용 화면입니다',
      'admin.blockBody': '데이터 현황 보드는 관리자 계정만 열람할 수 있습니다.<br>관리자 계정으로 로그인해 주세요.',
      /* --- 로그인/회원가입/비번찾기 (login.html · auth.js) --- */
      'login.brand.sub': '태웅로직스 물류 관제',
      'auth.tab.login': '로그인', 'auth.tab.signup': '회원가입', 'auth.tab.reset': '비밀번호 찾기',
      'auth.email': '이메일', 'auth.password': '비밀번호', 'auth.password.new': '새 비밀번호', 'auth.password2': '비밀번호 확인',
      'auth.code': '인증코드', 'auth.namedept': '이름/부서', 'auth.getcode': '인증코드 받기',
      'auth.sending': '발송중…', 'auth.resend': '재발송(%s)',
      'auth.btn.signup': '가입 신청', 'auth.btn.reset': '비밀번호 재설정',
      'auth.hint.login': '승인된 계정만 로그인할 수 있습니다. 관리자 승인 후 이용하세요.',
      'auth.hint.signup': '가입 신청 후 <b>관리자 승인</b>이 완료되면 로그인할 수 있습니다.',
      'auth.home': '← 홈으로', 'auth.codeHint': '메일로 받은 6자리',
      'auth.pw.len': '8자 이상', 'auth.pw.upper': '대문자', 'auth.pw.lower': '소문자', 'auth.pw.digit': '숫자', 'auth.pw.special': '특수문자',
      'auth.pw.weak': '약함', 'auth.pw.fair': '보통', 'auth.pw.strong': '강함', 'auth.pw.vstrong': '매우 강함',
      'auth.pw.strengthLabel': '강도: ', 'auth.pw.needSpecial': ' · 특수문자 필요',
      'auth.msg.emailFormat': '이메일 형식을 확인하세요.',
      'auth.msg.codeSent': '인증코드를 메일로 보냈습니다. 10분 내 입력하세요.',
      'auth.msg.sendFail': '발송 실패',
      'auth.msg.loginOk': '로그인 성공. 이동합니다…', 'auth.msg.loginFail': '로그인 실패',
      'auth.msg.pwRule': '비밀번호는 8자 이상 + 특수문자를 포함해야 합니다.',
      'auth.msg.pwMismatch': '비밀번호 확인이 일치하지 않습니다.',
      'auth.msg.signupOk': '가입 신청 완료! 관리자 승인 후 로그인할 수 있습니다.', 'auth.msg.signupFail': '가입 실패',
      'auth.msg.resetOk': '비밀번호가 재설정되었습니다. 로그인해 주세요.', 'auth.msg.resetFail': '재설정 실패',
      /* --- 홈 히어로 --- */
      'hero.h1': '항만·선석·운임 데이터,<br><span class="accent">한 화면에서 관리</span>합니다',
      'hero.sub': '태웅로직스는 해상·항공·복합운송과 CIS/철도, 프로젝트 물류까지 수행하는 종합물류기업입니다. 이 포털에서는 항만 혼잡도 <b>Port Insight</b>, 국내 터미널 <b>선석배정</b>, <b>선박 위치</b>·<b>운임지수</b>를 실데이터로 제공합니다.',
      'hero.cta1': 'Port Insight 살펴보기', 'hero.cta2': '선석배정 보기',
      'hero.note': 'IMF PortWatch <b id="heroPortCount">2,065</b>개 항만 네트워크 · 중점 모니터링 항만(Focus Port) 93개 매일 산출',
      'ls.pci': '종합 PCI (항만 혼잡도 지수)', 'ls.congested': '혼잡(CONGESTED) 항만',
      'ls.risk': '글로벌 리스크', 'ls.delay': '평균 접안 지연',
      /* --- 홈 운임 스트립(JS 렌더) --- */
      'fx.scfi': 'SCFI 종합', 'fx.ccfi': 'CCFI 종합', 'fx.ccfiKr': 'CCFI 한국항로', 'fx.ccfiEu': 'CCFI 유럽항로',
      'fx.pubdate': '발표일', 'fx.weekly': '주 1회 갱신', 'unit.ports': '개',
      /* --- 홈 서비스/대시보드/CTA/푸터 --- */
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
      'nav.home': 'Home', 'nav.portinsight': 'Port Insight',
      'nav.services': 'Services', 'nav.berth': 'Berth Plan', 'nav.vessel': 'Vessel',
      'nav.cargo': 'Cargo', 'nav.route': 'Route', 'nav.schedule': 'Schedule',
      'nav.status': 'Data', 'nav.contact': 'Contact', 'nav.cta': 'Contact Us',
      'auth.login': 'Sign in', 'auth.logout': 'Sign out', 'auth.admin': 'Approvals',
      'scope.dom': 'Domestic', 'scope.ovs': 'Overseas',
      'gate.title': 'Sign-in required',
      'gate.body': 'Key features are available after signing in.<br>Please sign in with an approved account or request an account.',
      'gate.cta': 'Sign in / Register', 'gate.home': 'Home',
      'gate.toastSub': 'Key features hide in <b>%ss</b> · sign in to continue',
      'admin.blockTitle': 'Administrators only',
      'admin.blockBody': 'The Data Status board is available to administrators only.<br>Please sign in with an admin account.',
      'login.brand.sub': 'Taewoong Logistics Control',
      'auth.tab.login': 'Sign in', 'auth.tab.signup': 'Register', 'auth.tab.reset': 'Reset password',
      'auth.email': 'Email', 'auth.password': 'Password', 'auth.password.new': 'New password', 'auth.password2': 'Confirm password',
      'auth.code': 'Verification code', 'auth.namedept': 'Name / Dept', 'auth.getcode': 'Get code',
      'auth.sending': 'Sending…', 'auth.resend': 'Resend (%s)',
      'auth.btn.signup': 'Request account', 'auth.btn.reset': 'Reset password',
      'auth.hint.login': 'Only approved accounts can sign in. Available after admin approval.',
      'auth.hint.signup': 'After requesting, you can sign in once <b>admin approval</b> is complete.',
      'auth.home': '← Home', 'auth.codeHint': '6-digit code from email',
      'auth.pw.len': 'At least 8 chars', 'auth.pw.upper': 'Uppercase', 'auth.pw.lower': 'Lowercase', 'auth.pw.digit': 'Number', 'auth.pw.special': 'Special char',
      'auth.pw.weak': 'Weak', 'auth.pw.fair': 'Fair', 'auth.pw.strong': 'Strong', 'auth.pw.vstrong': 'Very strong',
      'auth.pw.strengthLabel': 'Strength: ', 'auth.pw.needSpecial': ' · special char needed',
      'auth.msg.emailFormat': 'Please check the email format.',
      'auth.msg.codeSent': 'Verification code sent by email. Enter it within 10 minutes.',
      'auth.msg.sendFail': 'Send failed',
      'auth.msg.loginOk': 'Signed in. Redirecting…', 'auth.msg.loginFail': 'Sign-in failed',
      'auth.msg.pwRule': 'Password must be at least 8 characters and include a special character.',
      'auth.msg.pwMismatch': 'Passwords do not match.',
      'auth.msg.signupOk': 'Request submitted! You can sign in after admin approval.', 'auth.msg.signupFail': 'Registration failed',
      'auth.msg.resetOk': 'Password has been reset. Please sign in.', 'auth.msg.resetFail': 'Reset failed',
      'hero.h1': 'Port, berth & freight data,<br><span class="accent">managed in one place</span>',
      'hero.sub': 'Taewoong Logistics is a total logistics company covering ocean, air, intermodal, CIS/rail and project cargo. This portal delivers real-time data for port congestion (<b>Port Insight</b>), domestic terminal <b>berth planning</b>, <b>vessel positions</b> and <b>freight indices</b>.',
      'hero.cta1': 'Explore Port Insight', 'hero.cta2': 'View Berth Plan',
      'hero.note': 'IMF PortWatch network of <b id="heroPortCount">2,065</b> ports · 93 Focus Ports computed daily',
      'ls.pci': 'Overall PCI (Port Congestion Index)', 'ls.congested': 'Congested Ports',
      'ls.risk': 'Global Risk', 'ls.delay': 'Avg Berthing Delay',
      'fx.scfi': 'SCFI Composite', 'fx.ccfi': 'CCFI Composite', 'fx.ccfiKr': 'CCFI Korea', 'fx.ccfiEu': 'CCFI Europe',
      'fx.pubdate': 'Published', 'fx.weekly': 'Weekly update', 'unit.ports': '',
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
      'nav.home': '首页', 'nav.portinsight': 'Port Insight',
      'nav.services': '服务', 'nav.berth': '泊位分配', 'nav.vessel': '船舶位置',
      'nav.cargo': '货物追踪', 'nav.route': '航线分析', 'nav.schedule': '海外船期',
      'nav.status': '数据状态', 'nav.contact': '咨询', 'nav.cta': '联系咨询',
      'auth.login': '登录', 'auth.logout': '登出', 'auth.admin': '会员审批',
      'scope.dom': '国内', 'scope.ovs': '海外',
      'gate.title': '需要登录后使用',
      'gate.body': '主要功能需登录后使用。<br>请使用已审批的账户登录，或申请注册。',
      'gate.cta': '登录 / 注册', 'gate.home': '返回首页',
      'gate.toastSub': '<b>%s 秒</b>后主要功能将被隐藏 · 登录后继续',
      'admin.blockTitle': '仅限管理员',
      'admin.blockBody': '数据状态看板仅限管理员账户查看。<br>请使用管理员账户登录。',
      'login.brand.sub': '泰雄物流管控',
      'auth.tab.login': '登录', 'auth.tab.signup': '注册', 'auth.tab.reset': '找回密码',
      'auth.email': '邮箱', 'auth.password': '密码', 'auth.password.new': '新密码', 'auth.password2': '确认密码',
      'auth.code': '验证码', 'auth.namedept': '姓名/部门', 'auth.getcode': '获取验证码',
      'auth.sending': '发送中…', 'auth.resend': '重发(%s)',
      'auth.btn.signup': '提交注册', 'auth.btn.reset': '重置密码',
      'auth.hint.login': '仅限已审批账户登录，管理员审批后可用。',
      'auth.hint.signup': '提交注册后，经<b>管理员审批</b>后即可登录。',
      'auth.home': '← 返回首页', 'auth.codeHint': '邮件中的6位验证码',
      'auth.pw.len': '至少8位', 'auth.pw.upper': '大写字母', 'auth.pw.lower': '小写字母', 'auth.pw.digit': '数字', 'auth.pw.special': '特殊字符',
      'auth.pw.weak': '弱', 'auth.pw.fair': '中', 'auth.pw.strong': '强', 'auth.pw.vstrong': '很强',
      'auth.pw.strengthLabel': '强度：', 'auth.pw.needSpecial': ' · 需特殊字符',
      'auth.msg.emailFormat': '请检查邮箱格式。',
      'auth.msg.codeSent': '验证码已发送至邮箱，请10分钟内输入。',
      'auth.msg.sendFail': '发送失败',
      'auth.msg.loginOk': '登录成功，正在跳转…', 'auth.msg.loginFail': '登录失败',
      'auth.msg.pwRule': '密码需至少8位并含特殊字符。',
      'auth.msg.pwMismatch': '两次密码不一致。',
      'auth.msg.signupOk': '注册申请已提交！管理员审批后可登录。', 'auth.msg.signupFail': '注册失败',
      'auth.msg.resetOk': '密码已重置，请登录。', 'auth.msg.resetFail': '重置失败',
      'hero.h1': '港口·泊位·运价数据，<br><span class="accent">一屏统一管理</span>',
      'hero.sub': '泰雄物流是涵盖海运、空运、多式联运、独联体/铁路及项目物流的综合物流企业。本门户以实时数据提供港口拥堵（<b>Port Insight</b>）、国内码头<b>泊位分配</b>、<b>船舶位置</b>及<b>运价指数</b>。',
      'hero.cta1': '查看 Port Insight', 'hero.cta2': '查看泊位分配',
      'hero.note': 'IMF PortWatch <b id="heroPortCount">2,065</b> 个港口网络 · 每日测算 93 个重点监测港口',
      'ls.pci': '综合 PCI（港口拥堵指数）', 'ls.congested': '拥堵港口',
      'ls.risk': '全球风险', 'ls.delay': '平均靠泊延误',
      'fx.scfi': 'SCFI 综合', 'fx.ccfi': 'CCFI 综合', 'fx.ccfiKr': 'CCFI 韩国航线', 'fx.ccfiEu': 'CCFI 欧洲航线',
      'fx.pubdate': '发布日', 'fx.weekly': '每周更新', 'unit.ports': ' 个',
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

  /* .site-nav / .footer-links 링크 href → 사전 키 (페이지별 태깅 없이 크롬 자동 번역) */
  var NAVKEY = {
    '#modules': 'nav.services', 'index.html#modules': 'nav.services',
    '#contact': 'nav.contact', 'index.html#contact': 'nav.contact',
    'insight.html': 'nav.portinsight',
    'berth.html': 'nav.berth', 'vessel.html': 'nav.vessel', 'cargo.html': 'nav.cargo',
    'route.html': 'nav.route', 'schedule.html': 'nav.schedule', 'status.html': 'nav.status',
  };

  var TRANSLATE_ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'content', 'data-tip'];

  /*
   * Safety net for strings that are hard-coded in HTML or generated later by page JS.
   * Branded names and business data can stay as-is, but UI labels, hints, alerts,
   * empty states, dynamic cards and generated panel text should switch language.
   */
  var PHRASES = {
    en: {
      '본문으로 건너뛰기': 'Skip to main content',
      '태웅로직스 홈': 'Taewoong Logistics home',
      '메뉴 열기': 'Open menu',
      '주요 메뉴': 'Main menu',
      '푸터 메뉴': 'Footer menu',
      '언어 선택 / Language': 'Language selection',
      '테마 전환': 'Toggle theme',
      '도입 문의': 'Contact us',
      '문의': 'Contact',
      '홈으로': 'Home',
      '관리자': 'Administrator',
      '일반': 'User',
      '승인대기': 'Pending',
      '승인됨': 'Approved',
      '거부': 'Rejected',
      '거부됨': 'Rejected',
      '승인': 'Approve',
      '거부했습니다.': 'Rejected.',
      '승인했습니다.': 'Approved.',
      '비번재설정': 'Reset password',
      '새로고침': 'Refresh',
      '불러오는 중…': 'Loading...',
      '확인 중…': 'Checking...',
      '업데이트 확인 중…': 'Checking for updates...',
      '방금 업데이트': 'Updated just now',
      '실시간 연결 지연 — 마지막 수신 데이터를 표시 중입니다.': 'Live connection delayed - showing the last received data.',
      '태웅로직스 | 문의: itt@twsc.co.kr': 'Taewoong Logistics | Contact: itt@twsc.co.kr',
      '시각 표기 KST · 지표 산출 기준: 데이터 현황·상세기술서 참조 · 포털 v1.5 (2026-07-28 개정)': 'Times shown in KST · Metric definitions: see Data Status and technical spec · Portal v1.5 (revised 2026-07-28)',

      '로그인': 'Sign in',
      '로그아웃': 'Sign out',
      '회원가입': 'Register',
      '비밀번호 찾기': 'Reset password',
      '이메일': 'Email',
      '비밀번호': 'Password',
      '새 비밀번호': 'New password',
      '비밀번호 확인': 'Confirm password',
      '인증코드': 'Verification code',
      '인증코드 받기': 'Get code',
      '이름/부서': 'Name / Dept',
      '메일로 받은 6자리': '6-digit code from email',
      '예: 홍길동 / 영업1팀': 'e.g. Jane Kim / Sales Team 1',
      '가입 신청': 'Request account',
      '비밀번호 재설정': 'Reset password',
      '승인된 계정만 로그인할 수 있습니다. 관리자 승인 후 이용하세요.': 'Only approved accounts can sign in. Available after admin approval.',
      '가입 신청 후 관리자 승인이 완료되면 로그인할 수 있습니다.': 'You can sign in after your account request is approved by an administrator.',
      '강도: ': 'Strength: ',
      '특수문자 필요': 'special character needed',
      '8자 이상': 'At least 8 chars',
      '대문자': 'Uppercase',
      '소문자': 'Lowercase',
      '숫자': 'Number',
      '특수문자': 'Special char',
      '약함': 'Weak',
      '보통': 'Fair',
      '강함': 'Strong',
      '매우 강함': 'Very strong',
      '이메일 형식을 확인하세요.': 'Please check the email format.',
      '발송중…': 'Sending...',
      '인증코드를 메일로 보냈습니다. 10분 내 입력하세요.': 'Verification code sent by email. Enter it within 10 minutes.',
      '발송 실패': 'Send failed',
      '로그인 성공. 이동합니다…': 'Signed in. Redirecting...',
      '로그인 실패': 'Sign-in failed',
      '비밀번호는 8자 이상 + 특수문자를 포함해야 합니다.': 'Password must be at least 8 characters and include a special character.',
      '비밀번호 확인이 일치하지 않습니다.': 'Passwords do not match.',
      '가입 신청 완료! 관리자 승인 후 로그인할 수 있습니다.': 'Request submitted! You can sign in after admin approval.',
      '가입 실패': 'Registration failed',
      '비밀번호가 재설정되었습니다. 로그인해 주세요.': 'Password has been reset. Please sign in.',
      '재설정 실패': 'Reset failed',
      '관리자만 접근할 수 있습니다.': 'Administrators only.',
      '관리자 전용 화면입니다': 'Administrators only',
      '데이터 현황 보드는 관리자 계정만 열람할 수 있습니다.': 'The Data Status board is available to administrators only.',
      '관리자 계정으로 로그인해 주세요.': 'Please sign in with an admin account.',
      '로그인이 필요한 서비스입니다': 'Sign-in required',
      '주요 기능은 로그인 후 이용하실 수 있습니다.': 'Key features are available after signing in.',
      '승인된 계정으로 로그인하거나 회원가입을 신청해 주세요.': 'Please sign in with an approved account or request an account.',
      '로그인 / 회원가입': 'Sign in / Register',
      '새 임시 비밀번호를 입력하세요 (8자 이상, 특수문자 포함).': 'Enter a new temporary password (at least 8 chars, with a special character).',
      '비밀번호를 재설정했습니다.': 'Password has been reset.',
      '목록 조회 실패': 'Failed to load the list',
      '해당 항목이 없습니다.': 'No matching items.',
      '회원 승인 관리': 'Account Approval Management',
      '가입 신청을 검토하고 승인/거부합니다. 승인된 계정만 로그인할 수 있습니다.': 'Review account requests and approve or reject them. Only approved accounts can sign in.',
      '이메일(아이디)': 'Email (ID)',
      '이름/부서': 'Name / Dept',
      '상태': 'Status',
      '권한': 'Role',
      '신청일': 'Requested',
      '관리': 'Actions',

      '서비스': 'Services',
      '선석배정': 'Berth Plan',
      '선석배정현황': 'Berth Plan Status',
      '선석배정 현황': 'Berth Plan Status',
      '선박 위치': 'Vessel Positions',
      '화물 추적': 'Cargo Tracking',
      '경로 분석': 'Route Analysis',
      '해외 스케줄': 'Overseas Schedule',
      '데이터 현황': 'Data Status',
      '국내': 'Domestic',
      '해외': 'Overseas',
      '항만 혼잡도 대시보드': 'Port Congestion Dashboard',
      '글로벌 항만 혼잡도': 'Global Port Congestion',
      '일일 수집·적재 현황': 'Daily Collection & Load Status',
      '파이프라인 모니터링': 'Pipeline Monitoring',
      '실시간 AIS 지도': 'Live AIS Map',
      '해상·항공 수입 통관 진행': 'Ocean & Air Import Clearance Progress',
      '해상 경로·소요일 시뮬레이터': 'Ocean Route & Transit-Time Simulator',
      '해상 항로·소요일 시뮬레이터': 'Ocean Route & Transit-Time Simulator',
      '국내 터미널 통합': 'Domestic Terminal Integration',
      'Ship Schedule': 'Ship Schedule',
      '서비스 준비 중': 'Service in preparation',
      '서비스 준비 중입니다': 'Service is in preparation',
      '기획 화면': 'Planning screen',

      '금일 운영 스냅샷': 'Today\'s Operations Snapshot',
      '수집일 06:00 기준': 'Based on 06:00 collection date',
      '총 모선': 'Total vessels',
      '접안·작업중': 'Berthed / Working',
      '반입마감 임박': 'Closing soon',
      '금일 출항 예정': 'Departing today',
      '수집일 중 출항 (완료 제외)': 'Departures on collection date (excluding completed)',
      '기준시각 후 12시간 이내 마감': 'Closes within 12 hours after base time',
      '9개 터미널 합산': 'Total across 9 terminals',
      '부산신항·광양항·인천항 9개 터미널': '9 terminals in Busan New Port, Gwangyang and Incheon',
      '선석배정 목록': 'Berth Plan List',
      '접안(예정)일시 오름차순 · 반입마감 12시간 이내 강조': 'Sorted by berthing time · highlights closing within 12 hours',
      '항만 필터': 'Port filter',
      '터미널 필터': 'Terminal filter',
      '상태 필터': 'Status filter',
      '선석배정 검색': 'Berth plan search',
      '선명 / 선사 / 항로 / 항차 검색': 'Search vessel / carrier / route / voyage',
      '표시 방식': 'Display mode',
      '페이지': 'Page',
      '연속 스크롤': 'Infinite scroll',
      '그리드 형태': 'Grid layout',
      '평면 그리드': 'Flat grid',
      '트리 그리드': 'Tree grid',
      '컬럼 필터': 'Column filter',
      '페이지당': 'Per page',
      '페이지당 표시 건수': 'Rows per page',
      '행 우클릭 → 퀵뷰 메뉴': 'Right-click a row for quick view',
      '터미널': 'Terminal',
      '선석': 'Berth',
      '선명 / 모선항차': 'Vessel / Voyage',
      '선명/항차': 'Vessel / Voyage',
      '선명': 'Vessel',
      '모선명': 'Vessel name',
      '모선명 / IMO': 'Vessel name / IMO',
      '모선명 또는 IMO 번호': 'Vessel name or IMO number',
      '선사': 'Carrier',
      '항로': 'Route',
      '반입마감 (CCT)': 'Closing (CCT)',
      '반입마감': 'Closing',
      '접안 (ETB)': 'Berthing (ETB)',
      '출항 (ETD)': 'Departure (ETD)',
      '양하 (VAN)': 'Discharge (VAN)',
      '적하 (VAN)': 'Load (VAN)',
      '양하 합계': 'Total discharge',
      '적하 합계': 'Total load',
      '부터미널': 'Sub-terminal',
      '터미널명': 'Terminal name',
      '항만': 'Port',
      '모선': 'Vessel',
      '접안·작업중': 'Berthed / Working',
      '접안지연 6h+ 확률': 'Delay probability 6h+',
      '터미널별 요약': 'Summary by Terminal',
      '물량 소계 · 접안지연 리스크(몬테카를로 4,000회, 실측 접안편차 적합)': 'Volume subtotal · berthing-delay risk (4,000 Monte Carlo runs, fitted to actual berth deviations)',
      '항만 기상': 'Port Weather',
      '파고·풍속 현황 (Open-Meteo · 1시간 단위)': 'Wave and wind status (Open-Meteo · hourly)',
      '조건에 맞는 선석배정이 없습니다.': 'No berth plans match the conditions.',
      '전체 항만': 'All ports',
      '전체 터미널': 'All terminals',
      '터미널 전체': 'All terminals',
      '상태 전체': 'All statuses',
      '선사 전체': 'All carriers',
      '전체': 'All',
      '임박 (12h)': 'Soon (12h)',
      '이후 마감': 'Later closing',
      '마감 지남': 'Closed',
      '작업중': 'Working',
      '예정': 'Planned',
      '접안': 'Berthed',
      '출항': 'Departed',
      '복사됨': 'Copied',
      '복사 실패 — 수동 복사:': 'Copy failed - manual copy:',
      '내보내는 중…': 'Exporting...',
      '다운로드 완료': 'Download complete',
      '내보낼 데이터 없음': 'No data to export',
      '조회결과 Excel 다운로드': 'Download results to Excel',
      '선명·항차 복사': 'Copy vessel / voyage',
      '선박 위치 지도에서 보기': 'View on vessel position map',
      'VesselFinder 실시간 조회': 'Live search on VesselFinder',
      '경로 분석 열기': 'Open route analysis',
      '화물 추적 열기': 'Open cargo tracking',
      '수집 기준:': 'Collection basis:',
      '06:00 KST (일일 자동 수집) · 총': '06:00 KST (daily auto collection) · Total',

      '데이터 소스 최신성': 'Data Source Freshness',
      '갱신 주기 대비 경과 시간 기준 · 게이지 초과 전 정상 판정': 'Based on elapsed time versus refresh cycle · normal before threshold is exceeded',
      '선석배정 파이프라인 (금일)': 'Berth Plan Pipeline (Today)',
      '수집 → 적재 → DB → 화면 · 단계별 상태': 'Collection → Load → DB → Screen · Step status',
      '최근 7일 적재 기록': 'Last 7 Days Load History',
      '선석배정 일별 적재 이력 · 누락 일자 식별': 'Daily berth load history · identify missing dates',
      '적재 이력 상세': 'Load History Details',
      '최근 14건': 'Latest 14 records',
      '수집일': 'Collection date',
      '파일': 'File',
      '적재 건수': 'Loaded rows',
      '비고': 'Notes',
      '적재 시각': 'Loaded at',
      '모든 파이프라인 정상': 'All pipelines normal',
      '일부 파이프라인 확인 필요': 'Some pipelines need review',
      '파이프라인 점검 필요': 'Pipeline check required',
      '선석배정 금일분 적재 완료, Port Insight 24시간 내 산출': 'Today\'s berth plan loaded; Port Insight computed within 24 hours',
      '아래 최신성 카드에서 주의/지연 항목을 확인하십시오': 'Check warning/delayed items in the freshness cards below',
      '데이터 소스': 'Data source',
      '갱신 주기 대비 경과 시간': 'Elapsed time versus refresh cycle',
      '다음 갱신 예정': 'Next refresh',
      '연결 실패': 'Connection failed',
      '데이터 없음': 'No data',
      'API 응답 없음': 'No API response',
      '실시간 조회 정상': 'Live query normal',
      '관측 주기 1시간': 'Observation cycle: 1 hour',
      '상시': 'Always on',
      '상시 (30분 간격 갱신)': 'Always on (refreshes every 30 minutes)',
      '내일 06:00 수집 → 06시대 적재': 'Collect tomorrow 06:00 → load during 06:00 hour',
      '내일 06시대 자동 산출': 'Auto-compute tomorrow during 06:00 hour',
      '월요일 07시 수집': 'Collect Monday 07:00',
      '월요일 07시': 'Monday 07:00',
      '발표분': 'published batch',
      '주간 공표 (매주 금요일)': 'weekly publication (Fridays)',
      '최종 산출': 'Last computed',
      '산출 주기 24시간 (원천 데이터는 주간 갱신)': '24-hour compute cycle (source data updates weekly)',
      '기준일': 'base date',
      '파이프라인 점검 중…': 'Checking pipelines...',
      '터미널 수집': 'Terminal collection',
      '정규화·적재': 'Normalize / load',
      'DB 저장': 'DB save',
      '대시보드': 'Dashboard',
      '45초 폴링': '45 sec polling',
      '없음': 'None',
      '오늘': 'Today',
      '실패': 'Failed',
      '적재 이력이 없습니다.': 'No load history.',
      '정상': 'Normal',
      '주의': 'Watch',
      '지연': 'Delayed',
      '확인불가': 'Unavailable',

      '항만 주변 선박의 현재 위치를 실시간으로 표시합니다 (AIS 기반)': 'Shows current vessel positions around ports in real time (AIS-based).',
      '지도: VesselFinder Live AIS · 선박 클릭 시 선명·속력·목적지 확인 · 데이터는 참고용': 'Map: VesselFinder Live AIS · Click a vessel to view name, speed and destination · Reference only',
      '선박 찾기': 'Find vessel',
      '선석배정 DB 기준 · MBL/HBL/AWB는 화물 추적에서 조회': 'Based on berth-plan DB · Search MBL/HBL/AWB in Cargo Tracking',
      '선명 / 모선항차 검색 (예: MSC, HMM DIAMOND)': 'Search vessel / voyage (e.g. MSC, HMM DIAMOND)',
      '실시간 지도를 불러오지 못했습니다 (네트워크/차단 환경).': 'Could not load the live map (network or blocked environment).',
      '인터넷 연결 확인 후 새로고침하십시오.': 'Check the internet connection and refresh.',
      '검색 중…': 'Searching...',
      '검색 결과 없음': 'No results',
      '선석배정 DB에서 찾지 못했습니다. 철자를 확인하거나, 아래 버튼으로 외부 실시간 검색을 이용하십시오.': 'Not found in the berth-plan DB. Check spelling or use the external live search below.',
      'VesselFinder에서 실시간 검색 ↗': 'Live search on VesselFinder ↗',
      '터미널 위치로 확대 이동': 'Zoom to terminal location',
      '실시간 위치(VesselFinder) ↗': 'Live position (VesselFinder) ↗',
      '검색 실패 — 네트워크 확인 후 다시 시도하십시오.': 'Search failed - check the network and try again.',
      '지도 정중앙 = 터미널 위치 · 표시는 잠시 후 사라집니다': 'Map center = terminal location · marker disappears shortly',

      'MBL / HBL / AWB 번호로 관세청 통관 진행 상태를 조회합니다': 'Search Korea Customs clearance progress by MBL / HBL / AWB number.',
      '데이터: 관세청 유니패스 화물통관진행정보 OpenAPI · 항공 수입은 AWB 번호를 MBL로 조회 · 수출/환적은 미지원': 'Data: Korea Customs UNIPASS cargo-clearance OpenAPI · Air imports are searched as MBL by AWB number · Export/transshipment not supported',
      'B/L 번호 (예: HDMU1234567 / 180-12345675)': 'B/L number (e.g. HDMU1234567 / 180-12345675)',
      '조회': 'Search',
      '바로가기': 'Quick links',
      '터미널·선사·항공 무료 조회 채널': 'Free terminal, carrier and air-cargo search channels',
      'API 키 없이 즉시 조회 가능한 공식 채널 모음 · 새 탭으로 열림': 'Official channels available without API keys · opens in a new tab',
      '부산신항 터미널 반출입·본선작업': 'Busan New Port terminal gate / vessel work',
      '컨테이너 번호·모선항차로 터미널 직접 조회': 'Search terminals directly by container number or vessel voyage',
      '선사 컨테이너 트래킹': 'Carrier container tracking',
      '위 조회에서 MBL 입력 시 선사 자동 감지 딥링크 제공 (SCAC 12사) — 주요 선사 직접 링크': 'Entering an MBL above provides carrier auto-detection deep links (12 SCACs) - major carrier links',
      '항공 화물 (AWB)': 'Air cargo (AWB)',
      'AWB 번호로 항공사 공식 추적 · 위 조회에서 AWB 입력 시 항공사(10사) 자동 감지': 'Official airline tracking by AWB · airline auto-detection for AWB above (10 airlines)',
      '유니패스 API 키가 아직 설정되지 않았습니다': 'UNIPASS API key is not configured yet',
      '조회 결과 없음 / 오류': 'No result / error',
      '관세청 유니패스 조회 중…': 'Searching Korea Customs UNIPASS...',
      '백엔드 연결 실패': 'Backend connection failed',

      '평균 속력': 'Average speed',
      '시뮬레이션 실행': 'Run simulation',
      '지도 라이브러리를 불러오지 못했습니다 (오프라인). 수치 결과는 위 카드에서 확인하십시오.': 'Could not load the map library (offline). Check numeric results in the cards above.',
      '도착 소요일 분포': 'Transit-Time Distribution',
      '몬테카를로 10,000회': '10,000 Monte Carlo runs',
      '항로 계산 중… (searoute)': 'Calculating route... (searoute)',
      '계산 실패': 'Calculation failed',
      '항로 데이터를 찾을 수 없습니다': 'Route data not found',
      '해당 구간의 사전계산 항로가 없습니다': 'No precomputed route for this lane',
      '브라우저가 항로 데이터 로딩을 지원하지 않습니다': 'This browser does not support route data loading',
      '로컬 파일로 열면 항로 JSON을 불러올 수 없습니다. python server.py 또는 GitHub Pages 주소로 접속해 주세요.': 'Route JSON cannot be loaded from a local file. Open it with python server.py or the GitHub Pages URL.',
      '항만 기준 데이터를 불러오지 못했습니다': 'Could not load the port reference data',
      '항로 거리': 'Route distance',
      '예상 소요일 P50': 'Estimated transit time P50',
      '신뢰 구간 P10~P90': 'Confidence range P10-P90',
      '지연 리스크': 'Delay risk',
      '항로망 최단경로': 'Shortest route in route network',
      '중앙값': 'Median',
      '평균 속력': 'Average speed',
      '10회 중 8회는 이 구간 내 도착': '8 out of 10 arrivals fall in this range',
      'P50 대비 P90 추가 소요 (버퍼 권장치)': 'Extra time from P50 to P90 (recommended buffer)',
      '출발': 'Origin',
      '도착': 'Destination',
      '해리': 'nautical miles',
      '그 외': 'Outside range',
      '밀도 곡선': 'Density curve',
      '표본': 'samples',

      '선박 스케줄 조회': 'Ship Schedule Search',
      '조회 방식': 'Search type',
      '출발항 (POL)': 'Origin port (POL)',
      '도착항 (POD)': 'Destination port (POD)',
      'LOCODE 또는 항구명 (예: KRPUS)': 'LOCODE or port name (e.g. KRPUS)',
      'LOCODE 또는 항구명 (예: USSAV)': 'LOCODE or port name (e.g. USSAV)',
      '출발일': 'Departure date',
      '조회 주(weeks)': 'Weeks to search',
      '2주': '2 weeks',
      '4주': '4 weeks',
      '해외 터미널 현황': 'Overseas Terminal Status',
      '해당 항만의 입·출항 스케줄과 혼잡/현황을 제공합니다.': 'Provides arrival/departure schedules and congestion/status for the selected port.',
      '주요 해외 터미널의 선석·스케줄 정보를 국내 선석배정과 동일한 방식으로 제공할 예정입니다.': 'Major overseas terminal berth and schedule data will be provided in the same pattern as domestic berth plans.',

      '글로벌 혼잡도 스냅샷': 'Global Congestion Snapshot',
      '최근 7일 활동량 기준 · 전주 대비': 'Based on last 7 days of activity · week over week',
      '종합 PCI (Port Congestion Index)': 'Overall PCI (Port Congestion Index)',
      '혼잡(CONGESTED) 항만': 'Congested ports',
      '글로벌 리스크': 'Global risk',
      '평균 접안 지연': 'Average berthing delay',
      '혼잡 레벨 분포': 'Congestion level distribution',
      '레벨': 'Level',
      '비율': 'Ratio',
      '항만 수': 'Ports',
      '전주 대비': 'WoW',
      '권역별 혼잡도 현황': 'Regional Congestion Status',
      '최고 혼잡 Top 10': 'Top 10 Most Congested',
      '주요 항만 전체 PCI 현황 — 글로벌 지도': 'PCI Status for Major Ports - Global Map',
      '접안 전 대기 시간 최장 항만': 'Ports with Longest Pre-Berth Wait',
      '병목 현상 심각 항만': 'Severe Bottleneck Ports',
      '하역 작업 Ts (시간)': 'Cargo work Ts (hours)',
      '접안 전 대기 Tw (시간)': 'Pre-berth wait Tw (hours)',
      '관심 포트 검색': 'Focus Port Search',
      '항만명 검색 (예: 부산, Koper)': 'Search port name (e.g. Busan, Koper)',
      '관심 포트 검색 — 항구명(국문/영문) 또는 LOCODE (예: 부산, Savannah, USSAV)': 'Focus port search - port name or LOCODE (e.g. Busan, Savannah, USSAV)',
      '지도 라이브러리를 불러오지 못했습니다 (오프라인 환경).': 'Could not load the map library (offline environment).',
      '인터넷 연결 후 새로고침하면 지도가 표시됩니다. 데이터는 아래 표에서 동일하게 확인할 수 있습니다.': 'Connect to the internet and refresh to show the map. The same data is available in the tables below.',
      '현재 구간:': 'Current range:',
      '접안 지연': 'Berthing delay',
      '대기/접안': 'Waiting / berthed',
      '대기 / 접안': 'Waiting / berthed',
      '국가': 'Country',
      '대기 시간': 'Waiting time',
      '환산 일수': 'Equivalent days',
      '대기': 'Wait',
      '하역': 'Cargo work'
    },
    zh: {
      '본문으로 건너뛰기': '跳到主要内容',
      '태웅로직스 홈': '泰雄物流首页',
      '메뉴 열기': '打开菜单',
      '주요 메뉴': '主菜单',
      '푸터 메뉴': '页脚菜单',
      '언어 선택 / Language': '语言选择',
      '테마 전환': '切换主题',
      '도입 문의': '咨询',
      '문의': '咨询',
      '홈으로': '返回首页',
      '관리자': '管理员',
      '일반': '普通用户',
      '승인대기': '待审批',
      '승인됨': '已审批',
      '거부': '拒绝',
      '거부됨': '已拒绝',
      '승인': '审批',
      '거부했습니다.': '已拒绝。',
      '승인했습니다.': '已审批。',
      '비번재설정': '重置密码',
      '새로고침': '刷新',
      '불러오는 중…': '加载中...',
      '확인 중…': '检查中...',
      '업데이트 확인 중…': '正在检查更新...',
      '방금 업데이트': '刚刚更新',
      '실시간 연결 지연 — 마지막 수신 데이터를 표시 중입니다.': '实时连接延迟 - 正在显示最后接收的数据。',
      '태웅로직스 | 문의: itt@twsc.co.kr': '泰雄物流 | 咨询: itt@twsc.co.kr',
      '시각 표기 KST · 지표 산출 기준: 데이터 현황·상세기술서 참조 · 포털 v1.5 (2026-07-28 개정)': '时间以 KST 显示 · 指标口径见数据状态和技术说明 · 门户 v1.5（2026-07-28 修订）',

      '로그인': '登录',
      '로그아웃': '登出',
      '회원가입': '注册',
      '비밀번호 찾기': '找回密码',
      '이메일': '邮箱',
      '비밀번호': '密码',
      '새 비밀번호': '新密码',
      '비밀번호 확인': '确认密码',
      '인증코드': '验证码',
      '인증코드 받기': '获取验证码',
      '이름/부서': '姓名 / 部门',
      '메일로 받은 6자리': '邮件中的6位验证码',
      '예: 홍길동 / 영업1팀': '例如：张三 / 销售1组',
      '가입 신청': '提交注册',
      '비밀번호 재설정': '重置密码',
      '승인된 계정만 로그인할 수 있습니다. 관리자 승인 후 이용하세요.': '仅已审批账户可登录，请等待管理员审批。',
      '가입 신청 후 관리자 승인이 완료되면 로그인할 수 있습니다.': '提交注册后，经管理员审批即可登录。',
      '강도: ': '强度：',
      '특수문자 필요': '需要特殊字符',
      '8자 이상': '至少8位',
      '대문자': '大写字母',
      '소문자': '小写字母',
      '숫자': '数字',
      '특수문자': '特殊字符',
      '약함': '弱',
      '보통': '一般',
      '강함': '强',
      '매우 강함': '很强',
      '이메일 형식을 확인하세요.': '请检查邮箱格式。',
      '발송중…': '发送中...',
      '인증코드를 메일로 보냈습니다. 10분 내 입력하세요.': '验证码已发送至邮箱，请10分钟内输入。',
      '발송 실패': '发送失败',
      '로그인 성공. 이동합니다…': '登录成功，正在跳转...',
      '로그인 실패': '登录失败',
      '비밀번호는 8자 이상 + 특수문자를 포함해야 합니다.': '密码需至少8位并包含特殊字符。',
      '비밀번호 확인이 일치하지 않습니다.': '两次密码不一致。',
      '가입 신청 완료! 관리자 승인 후 로그인할 수 있습니다.': '注册申请已提交！管理员审批后可登录。',
      '가입 실패': '注册失败',
      '비밀번호가 재설정되었습니다. 로그인해 주세요.': '密码已重置，请登录。',
      '재설정 실패': '重置失败',
      '관리자만 접근할 수 있습니다.': '仅限管理员访问。',
      '관리자 전용 화면입니다': '仅限管理员',
      '데이터 현황 보드는 관리자 계정만 열람할 수 있습니다.': '数据状态看板仅限管理员账户查看。',
      '관리자 계정으로 로그인해 주세요.': '请使用管理员账户登录。',
      '로그인이 필요한 서비스입니다': '需要登录后使用',
      '주요 기능은 로그인 후 이용하실 수 있습니다.': '主要功能需登录后使用。',
      '승인된 계정으로 로그인하거나 회원가입을 신청해 주세요.': '请使用已审批账户登录，或申请注册。',
      '로그인 / 회원가입': '登录 / 注册',
      '새 임시 비밀번호를 입력하세요 (8자 이상, 특수문자 포함).': '请输入新的临时密码（至少8位，包含特殊字符）。',
      '비밀번호를 재설정했습니다.': '密码已重置。',
      '목록 조회 실패': '列表查询失败',
      '해당 항목이 없습니다.': '没有符合条件的项目。',
      '회원 승인 관리': '会员审批管理',
      '가입 신청을 검토하고 승인/거부합니다. 승인된 계정만 로그인할 수 있습니다.': '审核注册申请并审批/拒绝。仅已审批账户可登录。',
      '이메일(아이디)': '邮箱（ID）',
      '이름/부서': '姓名 / 部门',
      '상태': '状态',
      '권한': '权限',
      '신청일': '申请日',
      '관리': '管理',

      '서비스': '服务',
      '선석배정': '泊位分配',
      '선석배정현황': '泊位分配现况',
      '선석배정 현황': '泊位分配现况',
      '선박 위치': '船舶位置',
      '화물 추적': '货物追踪',
      '경로 분석': '航线分析',
      '해외 스케줄': '海外船期',
      '데이터 현황': '数据状态',
      '국내': '国内',
      '해외': '海外',
      '항만 혼잡도 대시보드': '港口拥堵看板',
      '글로벌 항만 혼잡도': '全球港口拥堵',
      '일일 수집·적재 현황': '每日采集与加载状态',
      '파이프라인 모니터링': '管道监控',
      '실시간 AIS 지도': '实时 AIS 地图',
      '해상·항공 수입 통관 진행': '海运/空运进口通关进度',
      '해상 경로·소요일 시뮬레이터': '海运航线与运输天数模拟器',
      '해상 항로·소요일 시뮬레이터': '海运航线与运输天数模拟器',
      '국내 터미널 통합': '国内码头整合',
      'Ship Schedule': '船期',
      '서비스 준비 중': '服务准备中',
      '서비스 준비 중입니다': '服务准备中',
      '기획 화면': '规划画面',

      '금일 운영 스냅샷': '今日运营快照',
      '수집일 06:00 기준': '按采集日 06:00 基准',
      '총 모선': '总船舶',
      '접안·작업중': '靠泊 / 作业中',
      '반입마감 임박': '截关临近',
      '금일 출항 예정': '今日预计离港',
      '수집일 중 출항 (완료 제외)': '采集日内离港（不含已完成）',
      '기준시각 후 12시간 이내 마감': '基准时间后12小时内截止',
      '9개 터미널 합산': '9个码头合计',
      '부산신항·광양항·인천항 9개 터미널': '釜山新港、光阳、仁川共9个码头',
      '선석배정 목록': '泊位分配列表',
      '접안(예정)일시 오름차순 · 반입마감 12시간 이내 강조': '按靠泊时间升序 · 高亮12小时内截关',
      '항만 필터': '港口筛选',
      '터미널 필터': '码头筛选',
      '상태 필터': '状态筛选',
      '선석배정 검색': '泊位分配搜索',
      '선명 / 선사 / 항로 / 항차 검색': '搜索船名 / 船司 / 航线 / 航次',
      '표시 방식': '显示方式',
      '페이지': '分页',
      '연속 스크롤': '连续滚动',
      '그리드 형태': '表格形态',
      '평면 그리드': '平面表格',
      '트리 그리드': '树形表格',
      '컬럼 필터': '列筛选',
      '페이지당': '每页',
      '페이지당 표시 건수': '每页显示行数',
      '행 우클릭 → 퀵뷰 메뉴': '右键行打开快速菜单',
      '터미널': '码头',
      '선석': '泊位',
      '선명 / 모선항차': '船名 / 航次',
      '선명/항차': '船名 / 航次',
      '선명': '船名',
      '모선명': '船名',
      '모선명 / IMO': '船名 / IMO',
      '모선명 또는 IMO 번호': '船名或 IMO 编号',
      '선사': '船司',
      '항로': '航线',
      '반입마감 (CCT)': '截关 (CCT)',
      '반입마감': '截关',
      '접안 (ETB)': '靠泊 (ETB)',
      '출항 (ETD)': '离港 (ETD)',
      '양하 (VAN)': '卸货 (VAN)',
      '적하 (VAN)': '装货 (VAN)',
      '양하 합계': '卸货合计',
      '적하 합계': '装货合计',
      '부터미널': '子码头',
      '터미널명': '码头名称',
      '항만': '港口',
      '모선': '船舶',
      '접안지연 6h+ 확률': '靠泊延误6小时+概率',
      '터미널별 요약': '按码头汇总',
      '물량 소계 · 접안지연 리스크(몬테카를로 4,000회, 실측 접안편차 적합)': '货量小计 · 靠泊延误风险（蒙特卡洛4,000次，拟合实测偏差）',
      '항만 기상': '港口气象',
      '파고·풍속 현황 (Open-Meteo · 1시간 단위)': '浪高/风速现况（Open-Meteo · 每小时）',
      '조건에 맞는 선석배정이 없습니다.': '没有符合条件的泊位分配。',
      '전체 항만': '全部港口',
      '전체 터미널': '全部码头',
      '터미널 전체': '全部码头',
      '상태 전체': '全部状态',
      '선사 전체': '全部船司',
      '전체': '全部',
      '임박 (12h)': '临近 (12h)',
      '이후 마감': '稍后截关',
      '마감 지남': '已过截关',
      '작업중': '作业中',
      '예정': '预计',
      '접안': '靠泊',
      '출항': '离港',
      '복사됨': '已复制',
      '복사 실패 — 수동 복사:': '复制失败 - 手动复制：',
      '내보내는 중…': '导出中...',
      '다운로드 완료': '下载完成',
      '내보낼 데이터 없음': '没有可导出的数据',
      '조회결과 Excel 다운로드': '下载查询结果 Excel',
      '선명·항차 복사': '复制船名/航次',
      '선박 위치 지도에서 보기': '在船舶位置地图查看',
      'VesselFinder 실시간 조회': 'VesselFinder 实时查询',
      '경로 분석 열기': '打开航线分析',
      '화물 추적 열기': '打开货物追踪',
      '수집 기준:': '采集基准：',
      '06:00 KST (일일 자동 수집) · 총': '06:00 KST（每日自动采集）· 共',

      '데이터 소스 최신성': '数据源新鲜度',
      '갱신 주기 대비 경과 시간 기준 · 게이지 초과 전 정상 판정': '按相对更新周期的经过时间判断 · 超阈值前为正常',
      '선석배정 파이프라인 (금일)': '泊位分配管道（今日）',
      '수집 → 적재 → DB → 화면 · 단계별 상태': '采集 → 加载 → DB → 画面 · 阶段状态',
      '최근 7일 적재 기록': '最近7天加载记录',
      '선석배정 일별 적재 이력 · 누락 일자 식별': '泊位分配每日加载记录 · 识别缺失日期',
      '적재 이력 상세': '加载历史详情',
      '최근 14건': '最近14条',
      '수집일': '采集日',
      '파일': '文件',
      '적재 건수': '加载件数',
      '비고': '备注',
      '적재 시각': '加载时间',
      '모든 파이프라인 정상': '所有管道正常',
      '일부 파이프라인 확인 필요': '部分管道需要确认',
      '파이프라인 점검 필요': '需要检查管道',
      '선석배정 금일분 적재 완료, Port Insight 24시간 내 산출': '今日泊位分配已加载，Port Insight 24小时内已计算',
      '아래 최신성 카드에서 주의/지연 항목을 확인하십시오': '请在下方新鲜度卡片确认注意/延迟项目',
      '데이터 소스': '数据源',
      '갱신 주기 대비 경과 시간': '相对更新周期的经过时间',
      '다음 갱신 예정': '下次更新',
      '연결 실패': '连接失败',
      '데이터 없음': '无数据',
      'API 응답 없음': 'API 无响应',
      '실시간 조회 정상': '实时查询正常',
      '관측 주기 1시간': '观测周期1小时',
      '상시': '常时',
      '상시 (30분 간격 갱신)': '常时（每30分钟更新）',
      '내일 06:00 수집 → 06시대 적재': '明日06:00采集 → 06点时段加载',
      '내일 06시대 자동 산출': '明日06点时段自动计算',
      '월요일 07시 수집': '周一07:00采集',
      '월요일 07시': '周一07:00',
      '발표분': '发布批次',
      '주간 공표 (매주 금요일)': '每周发布（每周五）',
      '최종 산출': '最终计算',
      '산출 주기 24시간 (원천 데이터는 주간 갱신)': '计算周期24小时（源数据每周更新）',
      '기준일': '基准日',
      '파이프라인 점검 중…': '正在检查管道...',
      '터미널 수집': '码头采集',
      '정규화·적재': '标准化/加载',
      'DB 저장': 'DB 保存',
      '대시보드': '看板',
      '45초 폴링': '45秒轮询',
      '없음': '无',
      '오늘': '今天',
      '실패': '失败',
      '적재 이력이 없습니다.': '没有加载历史。',
      '정상': '正常',
      '주의': '注意',
      '지연': '延迟',
      '확인불가': '无法确认',

      '항만 주변 선박의 현재 위치를 실시간으로 표시합니다 (AIS 기반)': '实时显示港口周边船舶当前位置（基于 AIS）。',
      '지도: VesselFinder Live AIS · 선박 클릭 시 선명·속력·목적지 확인 · 데이터는 참고용': '地图：VesselFinder Live AIS · 点击船舶查看船名、速度、目的地 · 仅供参考',
      '선박 찾기': '查找船舶',
      '선석배정 DB 기준 · MBL/HBL/AWB는 화물 추적에서 조회': '基于泊位分配 DB · MBL/HBL/AWB 请在货物追踪中查询',
      '선명 / 모선항차 검색 (예: MSC, HMM DIAMOND)': '搜索船名 / 航次（例：MSC, HMM DIAMOND）',
      '실시간 지도를 불러오지 못했습니다 (네트워크/차단 환경).': '无法加载实时地图（网络或阻止环境）。',
      '인터넷 연결 확인 후 새로고침하십시오.': '请确认网络连接后刷新。',
      '검색 중…': '搜索中...',
      '검색 결과 없음': '无搜索结果',
      '선석배정 DB에서 찾지 못했습니다. 철자를 확인하거나, 아래 버튼으로 외부 실시간 검색을 이용하십시오.': '未在泊位分配 DB 中找到。请检查拼写，或使用下方外部实时搜索。',
      'VesselFinder에서 실시간 검색 ↗': '在 VesselFinder 实时搜索 ↗',
      '터미널 위치로 확대 이동': '放大到码头位置',
      '실시간 위치(VesselFinder) ↗': '实时位置（VesselFinder）↗',
      '검색 실패 — 네트워크 확인 후 다시 시도하십시오.': '搜索失败 - 请检查网络后重试。',
      '지도 정중앙 = 터미널 위치 · 표시는 잠시 후 사라집니다': '地图中心 = 码头位置 · 标记稍后消失',

      'MBL / HBL / AWB 번호로 관세청 통관 진행 상태를 조회합니다': '通过 MBL / HBL / AWB 号码查询韩国海关通关进度。',
      '데이터: 관세청 유니패스 화물통관진행정보 OpenAPI · 항공 수입은 AWB 번호를 MBL로 조회 · 수출/환적은 미지원': '数据：韩国海关 UNIPASS 货物通关 OpenAPI · 空运进口以 AWB 作为 MBL 查询 · 暂不支持出口/转运',
      'B/L 번호 (예: HDMU1234567 / 180-12345675)': 'B/L 号码（例：HDMU1234567 / 180-12345675）',
      '조회': '查询',
      '바로가기': '快捷链接',
      '터미널·선사·항공 무료 조회 채널': '码头、船司、航空免费查询渠道',
      'API 키 없이 즉시 조회 가능한 공식 채널 모음 · 새 탭으로 열림': '无需 API Key 即可查询的官方渠道 · 新标签打开',
      '부산신항 터미널 반출입·본선작업': '釜山新港码头进出场/本船作业',
      '컨테이너 번호·모선항차로 터미널 직접 조회': '通过箱号/船名航次直接查询码头',
      '선사 컨테이너 트래킹': '船司集装箱追踪',
      '위 조회에서 MBL 입력 시 선사 자동 감지 딥링크 제공 (SCAC 12사) — 주요 선사 직접 링크': '上方输入 MBL 时自动识别船司并提供深链（12家SCAC）- 主要船司链接',
      '항공 화물 (AWB)': '航空货物（AWB）',
      'AWB 번호로 항공사 공식 추적 · 위 조회에서 AWB 입력 시 항공사(10사) 자동 감지': '通过 AWB 进行航空公司官方追踪 · 上方输入 AWB 时自动识别航空公司（10家）',
      '유니패스 API 키가 아직 설정되지 않았습니다': 'UNIPASS API Key 尚未设置',
      '조회 결과 없음 / 오류': '无结果 / 错误',
      '관세청 유니패스 조회 중…': '正在查询韩国海关 UNIPASS...',
      '백엔드 연결 실패': '后端连接失败',

      '평균 속력': '平均航速',
      '시뮬레이션 실행': '执行模拟',
      '지도 라이브러리를 불러오지 못했습니다 (오프라인). 수치 결과는 위 카드에서 확인하십시오.': '无法加载地图库（离线）。请在上方卡片查看数值结果。',
      '도착 소요일 분포': '到达天数分布',
      '몬테카를로 10,000회': '蒙特卡洛 10,000 次',
      '항로 계산 중… (searoute)': '正在计算航线... (searoute)',
      '계산 실패': '计算失败',
      '항로 데이터를 찾을 수 없습니다': '找不到航线数据',
      '해당 구간의 사전계산 항로가 없습니다': '该区间没有预计算航线',
      '브라우저가 항로 데이터 로딩을 지원하지 않습니다': '此浏览器不支持加载航线数据',
      '로컬 파일로 열면 항로 JSON을 불러올 수 없습니다. python server.py 또는 GitHub Pages 주소로 접속해 주세요.': '无法从本地文件加载航线 JSON。请使用 python server.py 或 GitHub Pages 地址访问。',
      '항만 기준 데이터를 불러오지 못했습니다': '无法加载港口基准数据',
      '항로 거리': '航线距离',
      '예상 소요일 P50': '预计运输天数 P50',
      '신뢰 구간 P10~P90': '置信区间 P10-P90',
      '지연 리스크': '延迟风险',
      '항로망 최단경로': '航线网络最短路径',
      '중앙값': '中位数',
      '평균 속력': '平均航速',
      '10회 중 8회는 이 구간 내 도착': '10次中约8次将在此区间内到达',
      'P50 대비 P90 추가 소요 (버퍼 권장치)': 'P90 相对 P50 的额外耗时（建议缓冲）',
      '출발': '出发',
      '도착': '到达',
      '해리': '海里',
      '그 외': '其余',
      '밀도 곡선': '密度曲线',
      '표본': '样本',

      '선박 스케줄 조회': '船期查询',
      '조회 방식': '查询方式',
      '출발항 (POL)': '出发港 (POL)',
      '도착항 (POD)': '目的港 (POD)',
      'LOCODE 또는 항구명 (예: KRPUS)': 'LOCODE 或港口名（例：KRPUS）',
      'LOCODE 또는 항구명 (예: USSAV)': 'LOCODE 或港口名（例：USSAV）',
      '출발일': '出发日',
      '조회 주(weeks)': '查询周数',
      '2주': '2周',
      '4주': '4周',
      '해외 터미널 현황': '海外码头状态',
      '해당 항만의 입·출항 스케줄과 혼잡/현황을 제공합니다.': '提供该港口的进出港船期和拥堵/状态。',
      '주요 해외 터미널의 선석·스케줄 정보를 국내 선석배정과 동일한 방식으로 제공할 예정입니다.': '主要海外码头的泊位/船期信息将以与国内泊位分配相同的方式提供。',

      '글로벌 혼잡도 스냅샷': '全球拥堵快照',
      '최근 7일 활동량 기준 · 전주 대비': '基于最近7天活动量 · 环比上周',
      '종합 PCI (Port Congestion Index)': '综合 PCI（港口拥堵指数）',
      '혼잡(CONGESTED) 항만': '拥堵港口',
      '글로벌 리스크': '全球风险',
      '평균 접안 지연': '平均靠泊延误',
      '혼잡 레벨 분포': '拥堵等级分布',
      '레벨': '等级',
      '비율': '比例',
      '항만 수': '港口数',
      '전주 대비': '环比上周',
      '권역별 혼잡도 현황': '区域拥堵状态',
      '최고 혼잡 Top 10': '拥堵最高 Top 10',
      '주요 항만 전체 PCI 현황 — 글로벌 지도': '主要港口 PCI 状态 - 全球地图',
      '접안 전 대기 시간 최장 항만': '靠泊前等待时间最长港口',
      '병목 현상 심각 항만': '瓶颈严重港口',
      '하역 작업 Ts (시간)': '装卸作业 Ts（小时）',
      '접안 전 대기 Tw (시간)': '靠泊前等待 Tw（小时）',
      '관심 포트 검색': '重点港口搜索',
      '항만명 검색 (예: 부산, Koper)': '搜索港口名（例：Busan, Koper）',
      '관심 포트 검색 — 항구명(국문/영문) 또는 LOCODE (예: 부산, Savannah, USSAV)': '重点港口搜索 - 港口名或 LOCODE（例：Busan, Savannah, USSAV）',
      '지도 라이브러리를 불러오지 못했습니다 (오프라인 환경).': '无法加载地图库（离线环境）。',
      '인터넷 연결 후 새로고침하면 지도가 표시됩니다. 데이터는 아래 표에서 동일하게 확인할 수 있습니다.': '联网并刷新后将显示地图。相同数据可在下方表格查看。',
      '현재 구간:': '当前区间：',
      '접안 지연': '靠泊延误',
      '대기/접안': '等待 / 靠泊',
      '대기 / 접안': '等待 / 靠泊',
      '국가': '国家',
      '대기 시간': '等待时间',
      '환산 일수': '折算天数',
      '대기': '等待',
      '하역': '装卸'
    }
  };

  var RULES = {
    en: [
      [/(\d+)\s*초 전 업데이트/g, 'Updated $1 sec ago'],
      [/(\d+)\s*분 전 업데이트/g, 'Updated $1 min ago'],
      [/(\d+)\s*시간 전 업데이트/g, 'Updated $1 hr ago'],
      [/(\d+)\s*분 전/g, '$1 min ago'],
      [/(\d+)\s*시간 전/g, '$1 hr ago'],
      [/(\d+)\s*일 전/g, '$1 days ago'],
      [/재발송\((\d+)\)/g, 'Resend ($1)'],
      [/(\d[\d,]*)\s*건 중\s*(\d[\d,]*)[–-](\d[\d,]*)/g, '$2-$3 of $1 records'],
      [/(\d[\d,]*)\s*\/\s*(\d[\d,]*)건 표시/g, 'Showing $1 / $2 records'],
      [/(\d[\d,]*)건 전체 표시/g, 'Showing all $1 records'],
      [/(\d[\d,]*)건 모두 표시됨/g, 'All $1 records shown'],
      [/더 보기 \(\+(\d[\d,]*)\)/g, 'Load more (+$1)'],
      [/총\s*(\d[\d,]*)개/g, 'Total $1'],
      [/(\d[\d,]*)개 일치/g, '$1 matches'],
      [/(\d[\d,]*)개 항만/g, '$1 ports'],
      [/(\d[\d,]*)개 터미널/g, '$1 terminals'],
      [/(\d[\d,]*)곳/g, '$1 sites'],
      [/(\d[\d,]*)회/g, '$1 runs'],
      [/(\d[\d,]*)척/g, '$1 vessels'],
      [/(\d[\d,]*)건/g, '$1 records'],
      [/(\d+(?:\.\d+)?)일/g, '$1 days'],
      [/파고\s*(\d+(?:\.\d+)?)m/g, 'wave $1m'],
      [/파주기\s*(\d+(?:\.\d+)?)s/g, 'wave period $1s'],
      [/풍속\s*(\d+(?:\.\d+)?)m\/s/g, 'wind $1m/s'],
      [/돌풍\s*(\d+(?:\.\d+)?)/g, 'gust $1'],
      [/선석\s*([A-Za-z0-9-]+)/g, 'berth $1'],
      [/수집분 표시 중 \(오프라인\)/g, 'collection shown (offline)']
    ],
    zh: [
      [/(\d+)\s*초 전 업데이트/g, '$1秒前更新'],
      [/(\d+)\s*분 전 업데이트/g, '$1分钟前更新'],
      [/(\d+)\s*시간 전 업데이트/g, '$1小时前更新'],
      [/(\d+)\s*분 전/g, '$1分钟前'],
      [/(\d+)\s*시간 전/g, '$1小时前'],
      [/(\d+)\s*일 전/g, '$1天前'],
      [/재발송\((\d+)\)/g, '重发($1)'],
      [/(\d[\d,]*)\s*건 중\s*(\d[\d,]*)[–-](\d[\d,]*)/g, '$1条中 $2-$3'],
      [/(\d[\d,]*)\s*\/\s*(\d[\d,]*)건 표시/g, '显示 $1 / $2 条'],
      [/(\d[\d,]*)건 전체 표시/g, '显示全部 $1 条'],
      [/(\d[\d,]*)건 모두 표시됨/g, '已显示全部 $1 条'],
      [/더 보기 \(\+(\d[\d,]*)\)/g, '查看更多 (+$1)'],
      [/총\s*(\d[\d,]*)개/g, '共 $1 个'],
      [/(\d[\d,]*)개 일치/g, '$1 个匹配'],
      [/(\d[\d,]*)개 항만/g, '$1 个港口'],
      [/(\d[\d,]*)개 터미널/g, '$1 个码头'],
      [/(\d[\d,]*)곳/g, '$1 处'],
      [/(\d[\d,]*)회/g, '$1 次'],
      [/(\d[\d,]*)척/g, '$1 艘'],
      [/(\d[\d,]*)건/g, '$1 条'],
      [/(\d+(?:\.\d+)?)일/g, '$1 天'],
      [/파고\s*(\d+(?:\.\d+)?)m/g, '浪高 $1m'],
      [/파주기\s*(\d+(?:\.\d+)?)s/g, '波周期 $1s'],
      [/풍속\s*(\d+(?:\.\d+)?)m\/s/g, '风速 $1m/s'],
      [/돌풍\s*(\d+(?:\.\d+)?)/g, '阵风 $1'],
      [/선석\s*([A-Za-z0-9-]+)/g, '泊位 $1'],
      [/수집분 표시 중 \(오프라인\)/g, '采集批次显示中（离线）']
    ]
  };

  function addDataPhrases(dict, lang) {
    var nameLang = lang === 'ko' ? 'ko' : 'en';
    try {
      if (window.TWDATA && window.TWDATA.getState) {
        var st = window.TWDATA.getState(0);
        (st.ports || []).forEach(function (p) { if (p.ko && p.en) dict[p.ko] = p[nameLang] || p.en; });
        (st.focusPorts || []).forEach(function (p) { if (p.ko && p.en) dict[p.ko] = p[nameLang] || p.en; });
        (st.regional || []).forEach(function (r) { if (r.ko && r.en) dict[r.ko] = r[nameLang] || r.en; });
      }
    } catch (e) { /* data layer may not be ready yet */ }
    try {
      if (window.TWBERTH && window.TWBERTH.TERMINALS) {
        var ports = { '부산신항': 'Busan New Port', '부산북항': 'Busan North Port', '광양항': 'Gwangyang Port', '인천항': 'Incheon Port' };
        Object.keys(ports).forEach(function (k) { dict[k] = lang === 'zh' ? ports[k] : ports[k]; });
      }
    } catch (e2) { /* berth layer may not be ready yet */ }
    return dict;
  }

  function phraseDict(lang) {
    var out = {};
    var src = PHRASES[lang] || {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return addDataPhrases(out, lang);
  }

  function applyRules(value, lang) {
    var out = value;
    (RULES[lang] || []).forEach(function (r) { out = out.replace(r[0], r[1]); });
    return out;
  }

  function translateValue(value, lang) {
    if (lang === 'ko' || value == null) return value;
    var src = String(value);
    if (!/[가-힣]/.test(src)) return src;
    var dict = phraseDict(lang);
    var lead = (src.match(/^\s*/) || [''])[0];
    var tail = (src.match(/\s*$/) || [''])[0];
    var core = src.trim();
    if (dict[core] != null) return lead + dict[core] + tail;

    var out = applyRules(src, lang);
    Object.keys(dict).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
      if (k && out.indexOf(k) >= 0) out = out.split(k).join(dict[k]);
    });
    return applyRules(out, lang);
  }

  function skipTextNode(n) {
    var p = n && n.parentElement;
    return !p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|CODE|PRE)$/i.test(p.tagName);
  }

  var translating = false;
  var observer = null;

  function translateNode(root, lang) {
    if (lang === 'ko' || !root || translating) return;
    translating = true;
    try {
      var start = root.nodeType === 9 ? root.documentElement : root;
      if (!start) return;
      if (start.nodeType === 3) {
        if (!skipTextNode(start)) {
          if (/[가-힣]/.test(start.nodeValue)) start.__twlOrigText = start.nodeValue;
          else if (start.__twlLastText && start.nodeValue !== start.__twlLastText) return;
          if (start.__twlOrigText != null) {
            var nt = translateValue(start.__twlOrigText, lang);
            start.__twlLastText = nt;
            if (start.nodeValue !== nt) start.nodeValue = nt;
          }
        }
      } else {
        var walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = walker.nextNode())) {
          if (skipTextNode(n)) continue;
          if (/[가-힣]/.test(n.nodeValue)) n.__twlOrigText = n.nodeValue;
          else if (n.__twlLastText && n.nodeValue !== n.__twlLastText) continue;
          if (n.__twlOrigText != null) {
            var next = translateValue(n.__twlOrigText, lang);
            n.__twlLastText = next;
            if (n.nodeValue !== next) n.nodeValue = next;
          }
        }
        translateAttrs(start, lang);
      }
    } finally {
      translating = false;
    }
  }

  function translateAttrs(root, lang) {
    function visit(el) {
      if (!el || !el.getAttribute) return;
      TRANSLATE_ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var cur = el.getAttribute(a);
        if (cur == null) return;
        if (!el.__twlOrigAttrs) el.__twlOrigAttrs = {};
        if (!el.__twlLastAttrs) el.__twlLastAttrs = {};
        if (/[가-힣]/.test(cur)) el.__twlOrigAttrs[a] = cur;
        else if (el.__twlLastAttrs[a] && cur !== el.__twlLastAttrs[a]) return;
        if (el.__twlOrigAttrs[a] == null) return;
        var next = translateValue(el.__twlOrigAttrs[a], lang);
        el.__twlLastAttrs[a] = next;
        if (cur !== next) el.setAttribute(a, next);
      });
    }
    if (root.nodeType === 1) visit(root);
    if (root.querySelectorAll) root.querySelectorAll('*').forEach(visit);
  }

  function restoreOriginals(root) {
    if (!root || translating) return;
    translating = true;
    try {
      var start = root.nodeType === 9 ? root.documentElement : root;
      if (!start) return;
      if (start.nodeType === 3 && start.__twlOrigText != null && (!start.__twlLastText || start.nodeValue === start.__twlLastText)) {
        start.nodeValue = start.__twlOrigText;
      }
      else {
        var walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = walker.nextNode())) {
          if (n.__twlOrigText != null && (!n.__twlLastText || n.nodeValue === n.__twlLastText)) n.nodeValue = n.__twlOrigText;
        }
        function visit(el) {
          if (!el || !el.__twlOrigAttrs) return;
          Object.keys(el.__twlOrigAttrs).forEach(function (a) {
            if (el.hasAttribute(a) && (!el.__twlLastAttrs || !el.__twlLastAttrs[a] || el.getAttribute(a) === el.__twlLastAttrs[a])) {
              el.setAttribute(a, el.__twlOrigAttrs[a]);
            }
          });
        }
        if (start.nodeType === 1) visit(start);
        if (start.querySelectorAll) start.querySelectorAll('*').forEach(visit);
      }
    } finally {
      translating = false;
    }
  }

  function translateDocument(lang) {
    if (lang === 'ko') restoreOriginals(document);
    else translateNode(document, lang);
  }

  function installObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (items) {
      if (translating || getLang() === 'ko') return;
      items.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(function (n) { translateNode(n, getLang()); });
        } else if (m.type === 'characterData') {
          translateNode(m.target, getLang());
        } else if (m.type === 'attributes') {
          translateNode(m.target, getLang());
        }
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATE_ATTRS
    });
  }

  function installPopupTranslator() {
    ['alert', 'confirm', 'prompt'].forEach(function (name) {
      var fn = window[name];
      if (!fn || fn.__twlWrapped) return;
      var wrapped = function (msg, def) {
        var text = translateValue(msg, getLang());
        return name === 'prompt' ? fn.call(window, text, def) : fn.call(window, text);
      };
      wrapped.__twlWrapped = true;
      window[name] = wrapped;
    });
  }

  function getLang() { try { var l = localStorage.getItem('twl-lang'); return LANGS.indexOf(l) >= 0 ? l : 'ko'; } catch (e) { return 'ko'; } }
  function saveLang(l) { try { localStorage.setItem('twl-lang', l); } catch (e) { /* */ } }

  function t(key, fallback) {
    var dict = T[getLang()] || T.ko;
    if (dict[key] != null) return dict[key];
    if (T.ko[key] != null) return T.ko[key];
    return fallback != null ? fallback : key;
  }

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
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph'); if (dict[k] != null) el.setAttribute('placeholder', dict[k]);
    });
    /* 네비/푸터: 태그 없는 링크는 href 기준 자동 번역 */
    document.querySelectorAll('.site-nav > a:not([data-i18n]), .footer-links > a:not([data-i18n])').forEach(function (a) {
      var key = NAVKEY[a.getAttribute('href')];
      if (key && dict[key] != null) a.textContent = dict[key];
    });
    document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === l); });
    translateDocument(l);
  }

  /* 언어 스위처 자동 주입 (.lang-switch 없을 때만) */
  function injectSwitch() {
    if (document.querySelector('.lang-switch')) return;
    var host = document.querySelector('.site-header .header-actions');
    if (!host) return;
    var box = document.createElement('div');
    box.className = 'lang-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', '언어 선택 / Language');
    box.innerHTML =
      '<button class="lang-btn" data-lang="ko" title="한국어">한</button>' +
      '<button class="lang-btn" data-lang="en" title="English">EN</button>' +
      '<button class="lang-btn" data-lang="zh" title="中文">中</button>';
    host.insertBefore(box, host.firstChild);
  }

  function bindSwitch() {
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      if (b.__twlBound) return; b.__twlBound = true;
      b.addEventListener('click', function () { window.TWI18N.setLang(b.getAttribute('data-lang')); });
    });
  }

  window.TWI18N = {
    LANGS: LANGS, getLang: getLang, t: t, apply: apply, translate: translateValue,
    setLang: function (l) {
      if (LANGS.indexOf(l) < 0) l = 'ko';
      saveLang(l); apply(l);
      try { window.dispatchEvent(new CustomEvent('twl:langchange', { detail: { lang: l } })); } catch (e) { /* */ }
    },
  };

  function boot() { installPopupTranslator(); injectSwitch(); apply(getLang()); bindSwitch(); installObserver(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
