var MH_all = [];
var mapHM_Over = [];
var roadHM_Over = [];

var HDH_all = [];
var mapHDH_Over = [];
var roadHDH_Over = [];

var MCR_all = [];
var mapMCR_Over = [];
var roadMCR_Over = [];

// 전역 팝업 객체 관리용 변수
var activeInfoWindow = null;

function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
        var ch = line[i];

        if (ch === '"') {
            inQuotes = !inQuotes;
        }
        else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        }
        else {
            current += ch;
        }
    }

    result.push(current);

    return result;
}

function loadMH(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) throw new Error("CSV 파일 로드 실패");
            return response.text();
        })
        .then(function(csvText) {
            parseMH(csvText);
        })
        .catch(function(error) {
            console.error("맨홀 데이터 로드 오류:", error);
        });
}

function parseMH(csvText) {
    MH_all = [];

    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = parseCSVLine(line);//line.split(',');

        var EQP_NM = columns[0] ? columns[0].trim().replace(/^"|"$/g, '') : '';
        var MNHL_LT = columns[1] ? columns[1].trim() : '-';
        var MNHL_BT = columns[2] ? columns[2].trim() : '-';
        var MNHL_HG = columns[3] ? columns[3].trim() : '-';
        var ENTRC_DP = columns[4] ? columns[4].trim() : '-';
        var STTUS_GRAD = columns[5] ? columns[5].trim() : '-';
        var LC_DC = columns[6] ? columns[6].trim().replace(/^"|"$/g, '') : '-';
        var INSTL_DE = columns[7] ? columns[7].trim() : '-';
        var lng = columns[8] ? parseFloat(columns[8].trim()) : 0;
        var lat = columns[9] ? parseFloat(columns[9].trim()) : 0;
        var ALT = columns[10] ? columns[10].trim() : '0';

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            MH_all.push({
                name: EQP_NM,
                lt: MNHL_LT, bt: MNHL_BT, hg: MNHL_HG, dp: ENTRC_DP,
                grade: STTUS_GRAD, lc: LC_DC, date: INSTL_DE,
                position: new kakao.maps.LatLng(lat, lng), alt: ALT
            });
        } catch (e) {
            console.error(i + "번째 행 맨홀 좌표 변환 실패:", e);
        }
    }
    console.log("맨홀 전체 개수:", MH_all.length);
}

function mapMH() {
    // 기존 표시된 맨홀 제거
    for (var i = 0; i < mapHM_Over.length; i++) {
        mapHM_Over[i].setMap(null);
    }
    mapHM_Over = [];

    // 지도가 일정 레벨 이상으로 멀어지면 표시 안 함 (필요시 조정 가능)
    if (map.getLevel() > 3) return;

    MH_all.forEach(function(mh) {
        if (!mapBounds.contain(mh.position)) return;
        // CustomOverlay HTML 내용 (아이콘 + 하단 글씨)
        // DOM 요소 생성
        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer'; // 클릭 가능 표시

        contentDiv.innerHTML = `
            <img class="icon1" src="icon/mh.png" alt="맨홀">
            <span class="label1">${mh.name}</span>
        `;

        // 오버레이 클릭 시 실행되는 함수 내부
        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            // 1. 모달에 바인딩할 데이터 준비
            var titleText = `${mh.name || '-'}`;

            var bodyContent = `
                <b>규격(가로x세로x높이):</b> ${mh.lt || '-'} x ${mh.bt || '-'} x ${mh.hg || '-'} m<br>
                <b>출입구 깊이:</b> ${mh.dp || '-'} m<br>
                <b>상태등급:</b> ${mh.grade || '-'} 등급<br>
                <b>위치설명:</b> ${mh.lc || '-'}<br>
                <b>설치일자:</b> ${mh.date || '-'}<br>
            `;

            // 2. 모달 열기 함수 호출
            openMcrModal(titleText, bodyContent);
        };

        var customOverlay = new kakao.maps.CustomOverlay({
            position: mh.position,
            content: contentDiv,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(map);
        mapHM_Over.push(customOverlay);
        
    });
}

function roadMH() {
    // 기존 로드뷰 오버레이 정리
    for (var i = 0; i < roadHM_Over.length; i++) {
        roadHM_Over[i].setMap(null);
    }
    roadHM_Over = [];

    // roadDistance(30m) 이내 맨홀만 필터링 후 오버레이 생성
    MH_all.forEach(function(mh) {
        var line = new kakao.maps.Polyline({path: [roadPos, mh.position]});
        var dist = line.getLength(); // m 단위 반환

        if (dist <= roadMaxD) {
            // CustomOverlay HTML 생성
            var content = `
                <div class="overlay1" style="cursor:pointer;">
                    <img class="icon1" src="icon/mh.png" alt="맨홀">
                    <span class="label1">${mh.name} (${Math.round(dist)}m)</span>
                </div>
            `;

            var customOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            // ★ 로드뷰(roadView)에 오버레이 올리기
            customOverlay.setMap(roadView);
            roadHM_Over.push(customOverlay);
        }
    });
}
function camMH() {
    MH_all.forEach(function(mh) { // camDistance 이내 맨홀을 카메라 화면에 투영
        // 내 위치 기준 동/북 거리(m). 맨홀은 지면이라 상하 = -CAMERA_HEIGHT
        var east = (mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (mh.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
        if (!p) return;// 카메라 뒤쪽 또는 화면 밖
        drawn.push({x: p.x, y: p.y, mh: mh});

        // 시험용: foreignObject와 별개로 순수 SVG 점
        //var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        //dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("r", 6); dot.setAttribute("fill", "red");
        //camSVG.appendChild(dot);

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="icon/mh.png" alt="맨홀">
                <span class="label1">${mh.name} (${Math.round(dist)}m)</span>
            </div>
        `;

        // foreignObject (SVG 안에 HTML 표시)
        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);// 가로 중앙 맞춤
        foreignObj.setAttribute("y", p.y - 12);// 아이콘(24px) 중심을 맨홀 위치에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}

//////////
function getHDHIcon(srCode) {
    if (srCode === 'S') {
        return 'icon/HDH_s.png';
    }

    if (srCode === 'R') {
        return 'icon/HDH_r.png';
    }

    return 'icon/HDH_r.png';
}

function loadHDH(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) {
                throw new Error("HDH CSV 파일 로드 실패");
            }

            return response.text();
        })
        .then(function(csvText) {
            parseHDH(csvText);
            // CSV 로드 후 바로 지도 표시
            //mapHDH();
            // 필요하면 현재 로드뷰 / 카메라 상태에 맞춰 호출
            // roadHDH();
            // camHDH();
        })
        .catch(function(error) {
            console.error("HDH 데이터 로드 오류:", error);
        });
}

function parseHDH(csvText) {
    HDH_all = [];

    var lines = csvText.trim().split(/\r?\n/);
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = parseCSVLine(line);

        var SR_CODE    = columns[0] ? columns[0].trim() : '';
        var EQP_NM     = columns[1] ? columns[1].trim() : '';
        var HNDHL_DP   = columns[2] ? columns[2].trim() : '';
        var STTUS_GRAD = columns[3] ? columns[3].trim() : '';
        var LC_DC      = columns[4] ? columns[4].trim() : '';
        var INSTL_DE   = columns[5] ? columns[5].trim() : '';

        var lng = columns[6] ? parseFloat(columns[6].trim()) : 0;
        var lat = columns[7] ? parseFloat(columns[7].trim()) : 0;
        var ALT = columns[8] ? parseFloat(columns[8].trim()) : 0;

        if (SR_CODE !== 'S' && SR_CODE !== 'R') continue;
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            HDH_all.push({
                srCode: SR_CODE,
                name: EQP_NM,
                dp: HNDHL_DP,
                grade: STTUS_GRAD,
                lc: LC_DC,
                date: INSTL_DE,
                position: new kakao.maps.LatLng(lat, lng),
                alt: ALT
            });
        }
        catch (e) {
            console.error(i + "번째 HDH 좌표 변환 실패:",e);
        }
    }

    console.log("HDH 전체 개수:", HDH_all.length);
}

function mapHDH() {
    // 기존 HDH 제거
    for (var i = 0; i < mapHDH_Over.length; i++) {
        mapHDH_Over[i].setMap(null);
    }

    mapHDH_Over = [];

    // 지도 레벨 제한
    if (map.getLevel() > 3) return;

    HDH_all.forEach(function(HDH) {
        // 현재 화면 안에 있는 HDH만 표시
        if (!mapBounds.contain(HDH.position)) return;

        var iconPath = getHDHIcon(HDH.srCode);
        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer';

        // 오버레이 라벨 (건물명 표시)
        contentDiv.innerHTML = `
            <img class="icon1" src="${iconPath}" alt="핸드홀">
            <span class="label1">${HDH.name}(${HDH.srCode})</span>
        `;

        // 오버레이 클릭 시 실행되는 함수 내부
        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            // 1. 모달에 바인딩할 데이터 준비
            var titleText = `${HDH.name}(${HDH.srCode})`;

            var bodyContent = `
                <b>차단밸브 관경:</b> ${HDH.dia || '-'} A<br>
                <b>밸브위치:</b> ${HDH.lc || '-'}<br>
                <b>깊이:</b> ${HDH.HNDHL_DP || '-'} m<br>
                <b>설치일:</b> ${HDH.date || '-'}<br>
                <b>등급:</b> ${HDH.grade || '-'}<br>
            `;

            // 2. 모달 열기 함수 호출
            openMcrModal(titleText, bodyContent);
        };

        var customOverlay = new kakao.maps.CustomOverlay({
            position: HDH.position,
            content: contentDiv,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(map);
        mapHDH_Over.push(customOverlay);
    });
}

function roadHDH() {
    // 기존 로드뷰 HDH 제거
    for (var i = 0; i < roadHDH_Over.length; i++) {
        roadHDH_Over[i].setMap(null);
    }

    roadHDH_Over = [];

    if (!roadPos) return;

    HDH_all.forEach(function(HDH) {
        var line = new kakao.maps.Polyline({path: [roadPos, HDH.position]});
        var dist = line.getLength();
        // 기존 roadMaxD 사용
        if (dist > roadMaxD) return;

        var iconPath = getHDHIcon(HDH.srCode);

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="${iconPath}" alt="HDH">
                <span class="label1">${HDH.name} (${Math.round(dist)}m)</span>
            </div>
        `;

        var customOverlay = new kakao.maps.CustomOverlay({
            position: HDH.position,
            content: content,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(roadView);
        roadHDH_Over.push(customOverlay);
    });
}

function camHDH() {
    HDH_all.forEach(function(HDH) {
        // 내 위치 기준 동 / 북 거리
        var east = (mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (mh.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return; // 카메라 표시 거리 제한

        var p = camProject(
            camRot,
            east,
            north,
            -CAMERA_HEIGHT,
            camWt,
            camHt,
            f,
            screenAngle
        );

        if (!p) return; // 카메라 뒤쪽 또는 화면 밖

        var iconPath = getHDHIcon(HDH.srCode);

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="${iconPath}" alt="HDH">
                <span class="label1">${HDH.name} (${Math.round(dist)}m)</span>
            </div>
        `;

        // foreignObject (SVG 안에 HTML 표시)
        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);// 가로 중앙 맞춤
        foreignObj.setAttribute("y", p.y - 12);// 아이콘(24px) 중심을 맨홀 위치에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}

//////////
function loadMCR(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) {
                throw new Error("MCR CSV 파일 로드 실패");
            }

            return response.text();
        })
        .then(function(csvText) {
            parseMCR(csvText);
            //mapMCR(); // CSV 로드 후 바로 지도 표시
            // 필요하면 현재 로드뷰 / 카메라 상태에 맞춰 호출
            // roadMCR();
            // camMCR();
        })
        .catch(function(error) {
            console.error("MCR 데이터 로드 오류:", error);
        });
}

function parseMCR(csvText) {
    MCR_all = [];

    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = parseCSVLine(line);

        // 컬럼 매핑 (MCR.csv 헤더 구조)
        // INDEX_KEY(0), BUILD_ID(1), ROOM_NAME(2), ROOM_ID(3), BUILD_NAME(4), LNG(5), LAT(6)...
        var buildId = columns[1] ? columns[1].trim() : '-';
        var roomName = columns[2] ? columns[2].trim() : '-';
        var roomId = columns[3] ? columns[3].trim() : '-';
        var buildName = columns[4] ? columns[4].trim().replace(/^"|"$/g, '') : '-';
        
        var lng = columns[5] ? parseFloat(columns[5].trim()) : 0;
        var lat = columns[6] ? parseFloat(columns[6].trim()) : 0;
        var alt = columns[7] ? columns[7].trim() : '0';
        var numHouse = columns[8] ? columns[8].trim() : '-';
        var heatLoad = columns[9] ? columns[9].trim() : '-';
        var valveDia = columns[10] ? columns[10].trim() : '-';
        var roomLc = columns[11] ? columns[11].trim().replace(/^"|"$/g, '') : '-';
        var valveLc = columns[12] ? columns[12].trim().replace(/^"|"$/g, '') : '-';
        var valveKey = columns[13] ? columns[13].trim().replace(/^"|"$/g, '') : '-';

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            MCR_all.push({
                buildName: buildName,
                roomName: roomName,
                buildId: buildId,
                roomId: roomId,
                dia: valveDia,       // 차단밸브 관경
                heat: heatLoad,      // 열부하
                house: numHouse,     // 세대수
                roomLc: roomLc,      // 기계실 위치
                valveLc: valveLc,    // 밸브 위치
                valveKey: valveKey,  // 밸브 형태
                alt: alt,            // 고도
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 MCR(기계실) 좌표 변환 실패:", e);
        }
    }
}


function mapMCR() {
    for (var i = 0; i < mapMCR_Over.length; i++) {
        mapMCR_Over[i].setMap(null);
    }
    mapMCR_Over = [];

    if (map.getLevel() > 3) return;
    var mapBounds = map.getBounds();

    MCR_all.forEach(function(MCR) {
        if (!mapBounds.contain(MCR.position)) return;

        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer';

        // 오버레이 라벨 (건물명 표시)
        contentDiv.innerHTML = `
            <img class="icon1" src="icon/MCR.png" alt="기계실">
            <span class="label1">${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})</span>
        `;
           //<span class="MCR-label" style="font-size:12px; font-weight:bold; background:#fff; padding:2px 4px; border-radius:3px; border:1px solid #333;">${MCR.buildName}</span>

        // 오버레이 클릭 시 실행되는 mapMCR 함수 내부
        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            // 1. 모달에 바인딩할 데이터 준비
            var titleText = `${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})`;

            var bodyContent = `
                <b>차단밸브 관경:</b> ${MCR.dia || '-'} A<br>
                <b>열부하:</b> ${MCR.heat || '-'} Mcal/h<br>
                <b>세대수:</b> ${MCR.house || '-'} 세대<br>
                <b>기계실 위치:</b> ${MCR.roomLc || '-'}<br>
                <b>밸브 위치:</b> ${MCR.valveLc || '-'}<br>
                <b>밸브 형태:</b> ${MCR.valveKey || '-'}<br>
            `;

            // 2. 모달 열기 함수 호출
            openMcrModal(titleText, bodyContent);
        };

        var customOverlay = new kakao.maps.CustomOverlay({
            position: MCR.position,
            content: contentDiv,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(map);
        mapMCR_Over.push(customOverlay);
    });
}

function roadMCR() {
    // 기존 로드뷰 MCR 제거
    for (var i = 0; i < roadMCR_Over.length; i++) {
        roadMCR_Over[i].setMap(null);
    }
    roadMCR_Over = [];

    if (!roadPos) return;

    MCR_all.forEach(function(MCR) {
        var line = new kakao.maps.Polyline({path: [roadPos, MCR.position]});
        var dist = line.getLength();
        // 기존 roadMaxD 사용
        if (dist > roadMaxD) return;

        var content = `
            <div class="overlay1">
                <img class="icon1" src="icon/MCR.png" alt="기계실">
                <span class="label1">${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})</span>
            </div>
        `;

        var customOverlay = new kakao.maps.CustomOverlay({
            position: MCR.position,
            content: content,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(roadView);
        roadMCR_Over.push(customOverlay);
    });
}

function camMCR() {
    MCR_all.forEach(function(MCR) {
        // 내 위치 기준 동 / 북 거리
        var east = (mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (mh.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return; // 카메라 표시 거리 제한

        var p = camProject(
            camRot,
            east,
            north,
            -CAMERA_HEIGHT,
            camWt,
            camHt,
            f,
            screenAngle
        );

        if (!p) return; // 카메라 뒤쪽 또는 화면 밖

        var content = `
            <div class="overlay1">
                <img class="icon1" src="icon/MCR.png" alt="기계실">
                <span class="label1">${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})</span>
            </div>
        `;

        // foreignObject (SVG 안에 HTML 표시)
        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);// 가로 중앙 맞춤
        foreignObj.setAttribute("y", p.y - 12);// 아이콘(24px) 중심을 맨홀 위치에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}