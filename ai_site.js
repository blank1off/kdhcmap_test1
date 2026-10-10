// 지사 선택 / 자동 전환.
// 지사별 데이터는 siteData에 따로 두고, 선택되면 작업 배열(PPG_all, MH_all, MCR_all, HDH_all, ETC_all)에 치환한다.
// 지도·로드뷰·카메라 코드는 작업 배열만 보므로 건드릴 것 없음.
var SITES = {
    bundang: {name: "분당", dir: "bundang", lat: [37.30, 37.46], lng: [127.03, 127.20]},
    paju:    {name: "파주", dir: "paju",    lat: [37.66, 37.80], lng: [126.68, 126.86]}
};// 지사 추가 = 여기 한 줄 + 폴더(PPG/MH/MCR/HDH/ETC.csv). lat/lng = 지사 범위 (남,북 / 서,동)
var siteData = {};// {bundang: {PPG, MH, MCR, HDH, ETC}} 지사별 캐시. 처음 선택될 때 CSV 로드
var currentSite = null;

// 지사 선택 <select> 채우기 (SITES 기준)
function initSiteSel() {
    var sel = document.getElementById("siteSel");
    sel.innerHTML = Object.keys(SITES).map(function(k) {
        return '<option value="' + k + '">' + SITES[k].name + '</option>';
    }).join('');
}

// 좌표가 속한 지사 키. 어느 범위에도 없으면 null
function siteAt(lat, lng) {
    for (var k in SITES) {
        var s = SITES[k];
        if (lat >= s.lat[0] && lat <= s.lat[1] && lng >= s.lng[0] && lng <= s.lng[1]) return k;
    }
    return null;
}

// 지사 전환. 캐시 있으면 바로 치환, 없으면 CSV 5개 로드 후 치환.
// goCenter=true(셀렉트로 직접 고른 경우)면 그 지사 열원으로 지도 이동. 시작·자동 전환 때는 지도 안 움직임
function selectSite(key, goCenter) {
    if (!SITES[key]) return;
    if (key === currentSite) {
        if (goCenter) goSiteCenter();// 같은 지사 다시 고르면 열원으로만 이동
        return;
    }
    currentSite = key;
    document.getElementById("siteSel").value = key;
    if (siteData[key]) {
        applySite(key);
        if (goCenter) goSiteCenter();
        return;
    }

    var dir = SITES[key].dir + "/";
    Promise.all(["PPG", "MH", "MCR", "HDH", "ETC"].map(function(t) {
        return fetch(dir + t + ".csv").then(function(response) {
            if (!response.ok) throw new Error(dir + t + ".csv 로드 실패");
            return response.text();
        });
    })).then(function(texts) {
        // parse*는 전역 *_all을 새 배열로 만들고 map*까지 그림. 끝난 뒤 그 배열을 캐시로 보관
        parsePPG(texts[0]);
        parseMH(texts[1]);
        parseMCR(texts[2]);
        parseHDH(texts[3]);
        parseETC(texts[4]);
        siteData[key] = {PPG: PPG_all, MH: MH_all, MCR: MCR_all, HDH: HDH_all, ETC: ETC_all};
        applySite(currentSite);// 로드 중 다른 지사로 바뀌었으면 그 지사 배열로 되돌림 (아직 로드 전이면 그쪽 로드가 끝나며 처리)
        if (goCenter && currentSite === key) goSiteCenter();
    }).catch(function(error) {
        console.error("지사 데이터 로드 오류:", error);
        alert(SITES[key].name + " 데이터 로드 실패\n" + error.message);
    });
}

// 캐시 배열을 작업 배열에 치환하고 다시 그림
function applySite(key) {
    var d = siteData[key];
    if (!d) return;
    PPG_all = d.PPG;
    MH_all = d.MH;
    MCR_all = d.MCR;
    HDH_all = d.HDH;
    ETC_all = d.ETC;
    mapUpdate();
}

// 현재 작업 배열의 열원(없으면 ETC 첫 행)으로 지도 이동. 레벨 3 = 배관·맨홀 다 보이는 지사 개요
function goSiteCenter() {
    var etc = ETC_all.find(function(e) { return e.TYPE === "열원"; }) || ETC_all[0];
    if (!etc || !map) return;
    map.setLevel(3);// 먼저 레벨 (panTo/setLevel 애니메이션 경합 방지)
    map.setCenter(etc.position);
}

// 지도 중심이 다른 지사 범위에 들어오면 자동 전환 (지도 idle마다 호출). 어느 범위도 아니면 현재 지사 유지
function autoSite(center) {
    var k = siteAt(center.getLat(), center.getLng());
    if (k && k !== currentSite) selectSite(k);
}
