var MH_all = [];
var mapHM_Over = [];
var roadHM_Over = [];
// MH 캐시 변수
var MH_roadCachePos = null;
var MH_roadOn = [];
var MH_camCachePos = null;
var MH_camOn = [];

var HDH_all = [];
var mapHDH_Over = [];
var roadHDH_Over = [];
// HDH 캐시 변수
var HDH_roadCachePos = null;
var HDH_roadOn = [];
var HDH_camCachePos = null;
var HDH_camOn = [];

var MCR_all = [];
var mapMCR_Over = [];
var roadMCR_Over = [];
// MCR 캐시 변수
var MCR_roadCachePos = null;
var MCR_roadOn = [];
var MCR_camCachePos = null;
var MCR_camOn = [];

var ETC_all = [];
var mapETC_Over = [];
var roadETC_Over = [];

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

        var columns = parseCSVLine(line);

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
    mapMH();
}

function mapMH() {
    for (var i = 0; i < mapHM_Over.length; i++) {
        mapHM_Over[i].setMap(null);
    }
    mapHM_Over = [];

    if (map.getLevel() > 3) return;

    MH_all.forEach(function(mh) {
        if (!mapBounds.contain(mh.position)) return;

        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer';

        contentDiv.innerHTML = `
            <img class="icon1" src="icon/mh.png" alt="맨홀">
            <span class="label1">${mh.name}</span>
        `;

        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            var titleText = `${mh.name || '-'}`;
            var bodyContent = `
                <b>규격(가로x세로x높이):</b> ${mh.lt || '-'} x ${mh.bt || '-'} x ${mh.hg || '-'} m<br>
                <b>출입구 깊이:</b> ${mh.dp || '-'} m<br>
                <b>상태등급:</b> ${mh.grade || '-'} 등급<br>
                <b>위치설명:</b> ${mh.lc || '-'}<br>
                <b>설치일자:</b> ${mh.date || '-'}<br>
            `;

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
    if (!roadPos) return;

    var currentLat = roadPos.getLat();
    var currentLng = roadPos.getLng();

    var needRecache = true;
    if (MH_roadCachePos) {
        var movedDist = getDistanceMeter(
            MH_roadCachePos.lat, MH_roadCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        MH_roadCachePos = { lat: currentLat, lng: currentLng };
        MH_roadOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        MH_all.forEach(function(mh) {
            var pos = mh.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                MH_roadOn.push(mh);
            }
        });
    }

    for (var i = 0; i < roadHM_Over.length; i++) {
        roadHM_Over[i].setMap(null);
    }
    roadHM_Over = [];

    MH_roadOn.forEach(function(mh) {
        var dist = getDistanceMeter(currentLat, currentLng, mh.position.getLat(), mh.position.getLng());

        if (dist <= roadMaxD) {
            var content = `
                <div class="overlay1" style="cursor:pointer;">
                    <img class="icon1" src="icon/mh.png" alt="맨홀">
                    <span class="label1">${mh.name}<br>(${Math.round(dist)}m)</span>
                </div>
            `;

            var customOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            customOverlay.setMap(roadView);
            roadHM_Over.push(customOverlay);
        }
    });
}

function camMH() {
    if (!cmaPos || !camRot || !camSVG) return;

    var currentLat = cmaPos.lat;
    var currentLng = cmaPos.lng;

    var needRecache = true;
    if (MH_camCachePos) {
        var movedDist = getDistanceMeter(
            MH_camCachePos.lat, MH_camCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        MH_camCachePos = { lat: currentLat, lng: currentLng };
        MH_camOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        MH_all.forEach(function(mh) {
            var pos = mh.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                MH_camOn.push(mh);
            }
        });
    }

    MH_camOn.forEach(function(mh) {
        var east = (mh.position.getLng() - currentLng) * 111320 * cosLat;
        var north = (mh.position.getLat() - currentLat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
        if (!p) return;

        drawn.push({x: p.x, y: p.y, mh: mh});

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="icon/mh.png" alt="맨홀">
                <span class="label1">${mh.name}<br>(${Math.round(dist)}m)</span>
            </div>
        `;

        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);
        foreignObj.setAttribute("y", p.y - 10);// 아이콘 높이 절반(20/2) → 아이콘 중심이 투영점 위에
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
    mapHDH();
}

function mapHDH() {
    for (var i = 0; i < mapHDH_Over.length; i++) {
        mapHDH_Over[i].setMap(null);
    }

    mapHDH_Over = [];

    if (map.getLevel() > 3) return;

    HDH_all.forEach(function(HDH) {
        if (!mapBounds.contain(HDH.position)) return;

        var iconPath = getHDHIcon(HDH.srCode);
        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer';

        contentDiv.innerHTML = `
            <img class="icon1" src="${iconPath}" alt="핸드홀">
            <span class="label1">${HDH.name}(${HDH.srCode})</span>
        `;

        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            var titleText = `${HDH.name}(${HDH.srCode})`;
            var bodyContent = `
                <b>밸브위치:</b> ${HDH.lc || '-'}<br>
                <b>깊이:</b> ${HDH.dp || '-'} m<br>
                <b>설치일:</b> ${HDH.date || '-'}<br>
                <b>등급:</b> ${HDH.grade || '-'}<br>
            `;

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
    if (!roadPos) return;

    var currentLat = roadPos.getLat();
    var currentLng = roadPos.getLng();

    var needRecache = true;
    if (HDH_roadCachePos) {
        var movedDist = getDistanceMeter(
            HDH_roadCachePos.lat, HDH_roadCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        HDH_roadCachePos = { lat: currentLat, lng: currentLng };
        HDH_roadOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        HDH_all.forEach(function(HDH) {
            var pos = HDH.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                HDH_roadOn.push(HDH);
            }
        });
    }

    for (var i = 0; i < roadHDH_Over.length; i++) {
        roadHDH_Over[i].setMap(null);
    }
    roadHDH_Over = [];

    HDH_roadOn.forEach(function(HDH) {
        var dist = getDistanceMeter(currentLat, currentLng, HDH.position.getLat(), HDH.position.getLng());
        
        if (dist <= roadMaxD) {
            var iconPath = getHDHIcon(HDH.srCode);
            var content = `
                <div class="overlay1" style="cursor:pointer;">
                    <img class="icon1" src="${iconPath}" alt="HDH">
                    <span class="label1">${HDH.name}<br>(${Math.round(dist)}m)</span>
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
        }
    });
}

function camHDH() {
    if (!cmaPos || !camRot || !camSVG) return;

    var currentLat = cmaPos.lat;
    var currentLng = cmaPos.lng;

    var needRecache = true;
    if (HDH_camCachePos) {
        var movedDist = getDistanceMeter(
            HDH_camCachePos.lat, HDH_camCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        HDH_camCachePos = { lat: currentLat, lng: currentLng };
        HDH_camOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        HDH_all.forEach(function(HDH) {
            var pos = HDH.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                HDH_camOn.push(HDH);
            }
        });
    }

    HDH_camOn.forEach(function(HDH) {
        var east = (HDH.position.getLng() - currentLng) * 111320 * cosLat;
        var north = (HDH.position.getLat() - currentLat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
        if (!p) return;

        var iconPath = getHDHIcon(HDH.srCode);

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="${iconPath}" alt="HDH">
                <span class="label1">${HDH.name}<br>(${Math.round(dist)}m)</span>
            </div>
        `;

        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);
        foreignObj.setAttribute("y", p.y - 8);// 아이콘 높이 절반(16/2) → 아이콘 중심이 투영점 위에
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
                dia: valveDia,
                heat: heatLoad,
                house: numHouse,
                roomLc: roomLc,
                valveLc: valveLc,
                valveKey: valveKey,
                alt: alt,
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 MCR(기계실) 좌표 변환 실패:", e);
        }
    }
    mapMCR();
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

        contentDiv.innerHTML = `
            <img class="icon1" src="icon/MCR.png" alt="기계실">
            <span class="label1">${MCR.buildName}(${MCR.roomName})</span>
        `;

        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            var titleText = `${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})`;
            var bodyContent = `
                <b>차단밸브 관경:</b> ${MCR.dia || '-'} A<br>
                <b>열부하:</b> ${MCR.heat || '-'} Mcal/h<br>
                <b>세대수:</b> ${MCR.house || '-'} 세대<br>
                <b>기계실 위치:</b> ${MCR.roomLc || '-'}<br>
                <b>밸브 위치:</b> ${MCR.valveLc || '-'}<br>
                <b>밸브 형태:</b> ${MCR.valveKey || '-'}<br>
            `;

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
    if (!roadPos) return;

    var currentLat = roadPos.getLat();
    var currentLng = roadPos.getLng();

    var needRecache = true;
    if (MCR_roadCachePos) {
        var movedDist = getDistanceMeter(
            MCR_roadCachePos.lat, MCR_roadCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        MCR_roadCachePos = { lat: currentLat, lng: currentLng };
        MCR_roadOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        MCR_all.forEach(function(MCR) {
            var pos = MCR.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                MCR_roadOn.push(MCR);
            }
        });
    }

    for (var i = 0; i < roadMCR_Over.length; i++) {
        roadMCR_Over[i].setMap(null);
    }
    roadMCR_Over = [];

    MCR_roadOn.forEach(function(MCR) {
        var dist = getDistanceMeter(currentLat, currentLng, MCR.position.getLat(), MCR.position.getLng());

        if (dist <= roadMaxD) {
            var content = `
                <div class="overlay1" style="cursor:pointer;">
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
        }
    });
}

function camMCR() {
    if (!cmaPos || !camRot || !camSVG) return;

    var currentLat = cmaPos.lat;
    var currentLng = cmaPos.lng;

    var needRecache = true;
    if (MCR_camCachePos) {
        var movedDist = getDistanceMeter(
            MCR_camCachePos.lat, MCR_camCachePos.lng,
            currentLat, currentLng
        );
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        MCR_camCachePos = { lat: currentLat, lng: currentLng };
        MCR_camOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        MCR_all.forEach(function(MCR) {
            var pos = MCR.position;
            var dLat = Math.abs(pos.getLat() - currentLat);
            var dLng = Math.abs(pos.getLng() - currentLng);

            if (dLat <= latDelta && dLng <= lngDelta) {
                MCR_camOn.push(MCR);
            }
        });
    }

    MCR_camOn.forEach(function(MCR) {
        var east = (MCR.position.getLng() - currentLng) * 111320 * cosLat;
        var north = (MCR.position.getLat() - currentLat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
        if (!p) return;

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="icon/MCR.png" alt="기계실">
                <span class="label1">${MCR.buildName}(${MCR.roomName})<br>${MCR.buildId}(${MCR.roomId})</span>
            </div>
        `;

        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);
        foreignObj.setAttribute("y", p.y - 10);// 아이콘 높이 절반(20/2) → 아이콘 중심이 투영점 위에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}


//////////
function getETCIcon(type) {
    if (type === '열원') {
        return 'icon/열원.png';
    }
    if (type === '가압장') {
        return 'icon/가압장.png';
    }
    if (type === '소각장') {
        return 'icon/소각장.png';
    }

    return 'icon/ETC_r.png';
}

function loadETC(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) {
                throw new Error("ETC CSV 파일 로드 실패");
            }
            return response.text();
        })
        .then(function(csvText) {
            parseETC(csvText);
        })
        .catch(function(error) {
            console.error("ETC 데이터 로드 오류:", error);
        });
}

function parseETC(csvText) {
    ETC_all = [];

    var lines = csvText.trim().split(/\r?\n/);
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = parseCSVLine(line);

        var TYPE = columns[0] ? columns[0].trim() : '';
        var NAME = columns[1] ? columns[1].trim() : '';
        var lat = columns[2] ? parseFloat(columns[2].trim()) : 0;
        var lng = columns[3] ? parseFloat(columns[3].trim()) : 0;
        var ETC1 = columns[4] ? columns[4].trim() : '';
        var ETC2 = columns[5] ? columns[5].trim() : '';
        var ETC3 = columns[6] ? columns[6].trim() : '';

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            ETC_all.push({
                TYPE: TYPE,
                NAME: NAME,
                ETC1: ETC1,
                ETC2: ETC2,
                ETC3: ETC3,
                position: new kakao.maps.LatLng(lat, lng),
            });
        }
        catch (e) {
            console.error(i + "번째 ETC 좌표 변환 실패:",e);
        }
    }
    mapETC();
}

function mapETC() {
    for (var i = 0; i < mapETC_Over.length; i++) {
        mapETC_Over[i].setMap(null);
    }

    mapETC_Over = [];

    if (map.getLevel() > 3) return;

    ETC_all.forEach(function(ETC) {
        if (!mapBounds.contain(ETC.position)) return;

        var iconPath = getETCIcon(ETC.TYPE);
        var contentDiv = document.createElement('div');
        contentDiv.className = 'overlay1';
        contentDiv.style.cursor = 'pointer';

        contentDiv.innerHTML = `
            <img class="icon1" src="${iconPath}" alt="기타">
            <span class="label1">${ETC.NAME}</span>
        `;

        contentDiv.onclick = function(e) {
            if (e && e.stopPropagation) e.stopPropagation();

            var titleText = `${ETC.NAME}`;
            var bodyContent = `
                <b>특성:</b> ${ETC.ETC1 || '-'}<br>
            `;

            openMcrModal(titleText, bodyContent);
        };

        var customOverlay = new kakao.maps.CustomOverlay({
            position: ETC.position,
            content: contentDiv,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(map);
        mapETC_Over.push(customOverlay);
    });
}

function roadETC() {
    if (!roadPos) return;

    for (var i = 0; i < roadETC_Over.length; i++) {
        roadETC_Over[i].setMap(null);
    }
    roadETC_Over = [];

    ETC_all.forEach(function(ETC) {
        var line = new kakao.maps.Polyline({path: [roadPos, ETC.position]});
        var dist = line.getLength();
        // 기존 roadMaxD 사용
        if (dist > roadMaxD) return;
        
        var iconPath = getETCIcon(ETC.TYPE);
        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="${iconPath}" alt="ETC">
                <span class="label1">${ETC.NAME}<br>(${Math.round(dist)}m)</span>
            </div>
        `;

        var customOverlay = new kakao.maps.CustomOverlay({
            position: ETC.position,
            content: content,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        customOverlay.setMap(roadView);
        roadETC_Over.push(customOverlay);
    });
}

function camETC() {
    if (!cmaPos || !camRot || !camSVG) return;

    ETC_all.forEach(function(ETC) {
        var east = (ETC.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (ETC.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
        if (!p) return;

        var iconPath = getETCIcon(ETC.TYPE);

        var content = `
            <div class="overlay1" style="cursor:pointer;">
                <img class="icon1" src="${iconPath}" alt="ETC">
                <span class="label1">${ETC.NAME}<br>(${Math.round(dist)}m)</span>
            </div>
        `;

        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);
        foreignObj.setAttribute("y", p.y - 10);// 아이콘 높이 절반(20/2) → 아이콘 중심이 투영점 위에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}