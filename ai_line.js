var PPG_all = [];
var PPG_on = [];
var mapPPG_poly = []; 
var mapPPG_label = [];

var roadPPG_over = [];
var roadPPG_label = [];
var road_pipe = [];

// ★ PPG 전역 캐시 변수 추가
var PPG_roadCachePos = null;
var PPG_roadOn = [];

var PPG_camCachePos = null;
var PPG_camOn = [];


function loadPPG(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) throw new Error("CSV 파일 로드 실패");
            return response.text();
        })
        .then(function(csvText) {
            parsePPG(csvText);
        })
        .catch(function(error) {
            console.error("오류 발생:", error);
        });
}

// CSV 파일 데이터 파싱
function parsePPG(csvText) {
    PPG_all = [];

    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    // 따옴표 수가 홀수인 줄 = 따옴표 안에서 줄바꿈된 행. 다음 줄과 합침 (PPG.csv에 LINE_NM 줄바꿈 1건)
    for (var k = 0; k < lines.length - 1; k++) {
        if ((lines[k].match(/"/g) || []).length % 2 === 1) {
            lines[k] += lines[k + 1];
            lines.splice(k + 1, 1);
            k--;
        }
    }

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var coordStartIndex = line.indexOf('"[');
        var coordEndIndex = line.lastIndexOf(']"');

        if (coordStartIndex === -1 || coordEndIndex === -1) continue;

        var propertiesPart = line.substring(0, coordStartIndex);
        var columns = parseCSVLine(propertiesPart);// point.js. 따옴표 안 콤마 처리 (LINE_NM에 콤마 있는 행). 끝의 빈 칸은 무시됨

        var eqpId = columns[0] ? columns[0].trim() : '';
        var srCode = columns[1] ? columns[1].trim() : '';
        var LINE_NM = columns[2] ? columns[2].trim() : '';
        var cntrwkNm = columns[3] ? columns[3].replace(/^"|"$/g, '').trim() : '';
        var diaCode = parseInt(columns[4], 10) || 0;
        var pipePress = columns[5] ? columns[5].trim() : '';
        var plineLt = columns[6] ? columns[6].trim() : '';
        var competDe = columns[7] ? columns[7].trim() : '';
        var qltyGrade = columns[8] ? columns[8].trim() : '';
        var avgDph = columns[11] ? columns[11].trim() : '';

        var coordString = line.substring(coordStartIndex + 1, coordEndIndex + 1);

        try {
            var rawCoords = JSON.parse(coordString);
            var coords = [];
            var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

            for (var j = 0; j < rawCoords.length; j++) {
                var lng = parseFloat(rawCoords[j][0]);
                var lat = parseFloat(rawCoords[j][1]);
                coords.push(new kakao.maps.LatLng(lat, lng));

                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }

            PPG_all.push({
                eqpId: eqpId,
                srCode: srCode,
                LINE_NM: LINE_NM,
                diaCode: diaCode,
                cntrwkNm: cntrwkNm,
                pipePress: pipePress,
                plineLt: plineLt,
                competDe: competDe,
                qltyGrade: qltyGrade,
                avgDph: avgDph,
                coords: coords,
                bounds: new kakao.maps.LatLngBounds(
                    new kakao.maps.LatLng(minLat, minLng),
                    new kakao.maps.LatLng(maxLat, maxLng)
                )
            });

        } catch (e) {
            console.error(i + "번째 행 좌표 변환 실패:", e);
        }
    }
    mapPPG();
}

function mapPPG(){
    for (var idx = 0; idx < mapPPG_label.length; idx++) {
        mapPPG_label[idx].setMap(null);
    }
    for (var idx = 0; idx < mapPPG_poly.length; idx++) {
        mapPPG_poly[idx].setMap(null);
    }
    mapPPG_label = [];
    mapPPG_poly = [];
    PPG_on = [];

    if (!map || PPG_all.length === 0) return;
    if (map.getLevel() >= 5) return;

    PPG_all.forEach(function(PPG) {
        if (!mapBounds.intersects(PPG.bounds)) return;

        var lineColor = '#FF0000';
        if (PPG.srCode === 'R') lineColor = '#FFA000';
        else if (PPG.srCode !== 'S') lineColor = '#888888';

        var poly = new kakao.maps.Polyline({
            path: PPG.coords,
            strokeWeight: 1,
            strokeColor: lineColor,
            strokeStyle: 'solid'
        });

        // forEach 콜백 안이라 폴리라인마다 PPG가 따로 잡힘 (for + var였을 땐 모든 클릭이 마지막 PPG를 가리킴)
        kakao.maps.event.addListener(poly, 'click', function(mouseEvent) {
            var titleText = `${PPG.LINE_NM} (${PPG.srCode || '-'})`;
            var bodyContent = `
                <b>설비ID:</b> ${PPG.eqpId || '-'}<br>
                <b>관경:</b> ${PPG.diaCode || '-'} mm<br>
                <b>설치일자:</b> ${PPG.competDe || '-'}<br>
                <b>상태:</b> ${PPG.qltyGrade || '-'}<br>
                <b>평균깊이:</b> ${PPG.avgDph || '-'} m
            `;

            openMcrModal(titleText, bodyContent);
        });

        poly.setMap(map);
        mapPPG_poly.push(poly);
        PPG_on.push(PPG);
    });

    if (map.getLevel() >= 3) return;
    if (PPG_on.length === 0) return;

    groupConnected(PPG_on).forEach(function(group) {
        var ttPPG = group.reduce(function(max, curr) {
            var maxLen = parseFloat(max.plineLt) || 0;
            var currLen = parseFloat(curr.plineLt) || 0;
            return currLen > maxLen ? curr : max;
        }, group[0]);

        var midCoordIndex = Math.floor((ttPPG.coords.length - 1) / 2);
        var p1 = ttPPG.coords[midCoordIndex];
        var p2 = ttPPG.coords[midCoordIndex + 1] || p1;

        var overlay = null;
        if (ttPPG.srCode === 'S'){
            var centerPosition = getPointAtRatio(p1, p2, 0.1);
            var overlayContent = '<div class="ppg-s-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }
        if (ttPPG.srCode === 'R'){
            var centerPosition = getPointAtRatio(p1, p2, 0.9);
            var overlayContent = '<div class="ppg-r-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }

        if (overlay) {
            overlay.setMap(map);
            mapPPG_label.push(overlay);
        }
    });
}

// ★ 캐시 방식 적용된 roadPPG
function roadPPG(){
    for (var idx = 0; idx < roadPPG_label.length; idx++) {
        if (roadPPG_label[idx] && roadPPG_label[idx].parentNode) {
            roadPPG_label[idx].remove();
        }
    }
    for (var i = 0; i < roadPPG_over.length; i++) {
        roadPPG_over[i].setMap(null);
    }
    roadPPG_label = [];
    roadPPG_over = [];
    road_pipe = [];

    if (!roadPos) return;
    var roadLat = roadPos.getLat();
    var roadLng = roadPos.getLng();

    // 1. 30m 이동 여부 확인 및 60m 캐시 바운딩 영역 생성
    var needRecache = true;
    if (PPG_roadCachePos) {
        var movedDist = getDistanceMeter(PPG_roadCachePos.lat, PPG_roadCachePos.lng, roadLat, roadLng);
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        PPG_roadCachePos = { lat: roadLat, lng: roadLng };
        PPG_roadOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(roadLat * Math.PI / 180));

        var searchBounds = new kakao.maps.LatLngBounds(
            new kakao.maps.LatLng(roadLat - latDelta, roadLng - lngDelta),
            new kakao.maps.LatLng(roadLat + latDelta, roadLng + lngDelta)
        );

        // Bounds 인터섹션 검사로 60m 영역 내 배관 1차 고속 필터링
        PPG_all.forEach(function(PPG, id0) {
            if (PPG.bounds && searchBounds.intersects(PPG.bounds)) {
                PPG_roadOn.push({ ppg: PPG, originalId: id0 });
            }
        });
    }

    // 2. 전체 배관(PPG_all) 대신 60m 캐시 리스트(PPG_roadOn)만 계산
    PPG_roadOn.forEach(function(item) {
        var PPG = item.ppg;
        var id0 = item.originalId;

        if (!PPG.coords || PPG.coords.length < 2) return;

        for (var id1 = 0; id1 < PPG.coords.length - 1; id1++) {
            var pos1 = PPG.coords[id1];
            var pos2 = PPG.coords[id1 + 1];

            var closestPt = getClosestPointOnLine(
                roadLat, roadLng,
                pos1.getLat(), pos1.getLng(),
                pos2.getLat(), pos2.getLng()
            );

            var distance = getDistanceMeter(roadLat, roadLng, closestPt.lat, closestPt.lng);
            if (distance > roadMaxD) continue;
        
            var element1 = make_roadPPG_over(pos1, id0, id1, PPG);
            var element2 = make_roadPPG_over(pos2, id0, id1+1, PPG);

            var color = '#888888';
            if (PPG.srCode === 'S') color = '#FF0000';
            if (PPG.srCode === 'R') color = '#FFA000';

            road_pipe.push({
                id0: id0,
                el1: element1,
                el2: element2,
                pos1: pos1,
                pos2: pos2,
                inner1: false,
                inner2: false,
                x1:0, y1:0, x2:0, y2:0,
                color: color,
            });
        }
    });

    road_pipe.forEach(function(pipe) {
        var margin = 1;

        var rect1 = pipe.el1.getBoundingClientRect();
        if (rect1.width === 0 && rect1.height === 0) 
            pipe.inner1 = false;
        else {
            pipe.x1 = rect1.left + rect1.width / 2 - roadRect.left;
            pipe.y1 = rect1.top + rect1.height / 2 - roadRect.top;

            if (pipe.x1 >= -margin && pipe.x1 <= roadWt + margin &&
                pipe.y1 >= -margin && pipe.y1 <= roadHt + margin) 
                pipe.inner1 = true;
        }

        var rect2 = pipe.el2.getBoundingClientRect();
        if (rect2.width === 0 && rect2.height === 0)
            pipe.inner2 = false;
        else {
            pipe.x2 = rect2.left + rect2.width / 2 - roadRect.left;
            pipe.y2 = rect2.top + rect2.height / 2 - roadRect.top;

            if (pipe.x2 >= -margin && pipe.x2 <= roadWt + margin &&
                pipe.y2 >= -margin && pipe.y2 <= roadHt + margin) 
                pipe.inner2 = true;
        }

        if (pipe.inner1 && pipe.inner2) 
            lineDraw(pipe.x1, pipe.y1, pipe.x2, pipe.y2, pipe.color, roadSVG);
        if (pipe.inner1 && !pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos1, pipe.pos2, pipe.id0);
            if (tempPoint) {
                var dx = tempPoint.x - pipe.x1;
                var dy = tempPoint.y - pipe.y1;
                var end = extendToRectEdge(pipe.x1, pipe.y1, dx, dy, roadWt, roadHt);

                lineDraw(pipe.x1, pipe.y1, end.x, end.y, pipe.color, roadSVG);
            }
        }
        if (!pipe.inner1 && pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos2, pipe.pos1, pipe.id0);
            if (tempPoint) {
                var dx = tempPoint.x - pipe.x2;
                var dy = tempPoint.y - pipe.y2;
                var end = extendToRectEdge(pipe.x2, pipe.y2, dx, dy, roadWt, roadHt);

                lineDraw(pipe.x2, pipe.y2, end.x, end.y, pipe.color, roadSVG);
            }
        }
        if (!pipe.inner1 && !pipe.inner2) {
            var tempPoints = findVisibleTempPoint2(pipe.pos1, pipe.pos2, pipe.id0);
            if (tempPoints.point1 && tempPoints.point2) {
                var dx = tempPoints.point1.x - tempPoints.point2.x;
                var dy = tempPoints.point1.y - tempPoints.point2.y;
                var end1 = extendToRectEdge(tempPoints.point1.x, tempPoints.point1.y, dx, dy, roadWt, roadHt);
                var end2 = extendToRectEdge(tempPoints.point2.x, tempPoints.point2.y, -dx, -dy, roadWt, roadHt);

                lineDraw(end1.x, end1.y, end2.x, end2.y, pipe.color, roadSVG);
            }
        }
    });

    if (road_pipe.length === 0) return;

    var visiblePPGs = [];
    var visiblePPGIds = new Set();

    road_pipe.forEach(function(pipe) {
        if ((pipe.inner1 || pipe.inner2) && !visiblePPGIds.has(pipe.id0)) {
            visiblePPGIds.add(pipe.id0);
            visiblePPGs.push(PPG_all[pipe.id0]);
        }
    });

    if (visiblePPGs.length === 0) return;

    groupConnected(visiblePPGs).forEach(function(group) {
        var ttPPG = group.reduce(function(max, curr) {
            var maxLen = parseFloat(max.plineLt) || 0;
            var currLen = parseFloat(curr.plineLt) || 0;
            return currLen > maxLen ? curr : max;
        }, group[0]);

        var midIdx = Math.floor((ttPPG.coords.length - 1) / 2);
        var p1 = ttPPG.coords[midIdx];
        var p2 = ttPPG.coords[midIdx + 1] || p1;

        var centerPos = (ttPPG.srCode === 'S') 
            ? getPointAtRatio(p1, p2, 0.1) 
            : getPointAtRatio(p1, p2, 0.9);

        var tempElement = make_roadPPG_over(centerPos, -1, -1, { srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        
        var x = rect.left + rect.width / 2 - roadRect.left;
        var y = rect.top + rect.height / 2 - roadRect.top;

        tempElement.remove();

        if (rect.width === 0 || rect.height === 0 || x < 0 || x > roadWt || y < 0 || y > roadHt) {
            return;
        }

        var labelClass = (ttPPG.srCode === 'S') ? 'road-s-pipe' : 'road-r-pipe';
        var labelColor = (ttPPG.srCode === 'S') ? '#FF0000' : '#FFA000';

        var foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObj.setAttribute('x', (x - 60).toFixed(1)); // 너비 절반만큼 왼쪽 이동 (중앙 정렬)
        foreignObj.setAttribute('y', (y - 20).toFixed(1)); // 높이 절반만큼 위로 이동
        foreignObj.setAttribute('width', '120');
        foreignObj.setAttribute('height', '40');

        // HTML 형식으로 <br>을 써서 자연스럽게 줄바꿈
        foreignObj.innerHTML = `
            <div class="${labelClass}" style="text-align: center; color: ${labelColor};">
                ${ttPPG.diaCode}A<br>(${ttPPG.LINE_NM})
            </div>
        `;

        roadSVG.appendChild(foreignObj);
        roadPPG_label.push(foreignObj);
    });
}

// ★ road_pipe 방식 camPPG: cam_pipe 배열에 세그먼트 정보를 모은 뒤 투영·그리기·라벨을 배열 기준으로 처리
var cam_pipe = [];
var CAM_NEAR = 0.3;// 카메라 앞 이 거리(m)보다 가까운 부분은 잘라냄. 뒤쪽 점은 투영이 뒤집히므로 선을 여기서 자름

function camPPG() {
    cam_pipe = [];
    if (!cmaPos || !camRot || !camSVG) return;
    // camSVG 비우기는 drawCam이 함. 여기서 비우면 drawCam이 먼저 그린 십자선이 지워짐

    var currentLat = cmaPos.lat;
    var currentLng = cmaPos.lng;

    // 1. 30m 이동 여부 확인 및 60m 캐시 바운딩 영역 생성 (roadPPG와 동일)
    var needRecache = true;
    if (PPG_camCachePos) {
        var movedDist = getDistanceMeter(PPG_camCachePos.lat, PPG_camCachePos.lng, currentLat, currentLng);
        if (movedDist < 30) {
            needRecache = false;
        }
    }

    if (needRecache) {
        PPG_camCachePos = { lat: currentLat, lng: currentLng };
        PPG_camOn = [];

        var latDelta = 60 / 111320;
        var lngDelta = 60 / (111320 * Math.cos(currentLat * Math.PI / 180));

        var searchBounds = new kakao.maps.LatLngBounds(
            new kakao.maps.LatLng(currentLat - latDelta, currentLng - lngDelta),
            new kakao.maps.LatLng(currentLat + latDelta, currentLng + lngDelta)
        );

        PPG_all.forEach(function(PPG, id0) {
            if (PPG.bounds && searchBounds.intersects(PPG.bounds)) {
                PPG_camOn.push({ ppg: PPG, originalId: id0 });
            }
        });
    }

    // 2. cam_pipe 생성: 내 위치에서 세그먼트까지 최단거리가 camDistance 이내인 것만 (roadPPG와 같은 기준)
    PPG_camOn.forEach(function(item) {
        var PPG = item.ppg;
        var id0 = item.originalId;

        if (!PPG.coords || PPG.coords.length < 2) return;

        var color = '#888888';
        if (PPG.srCode === 'S') color = '#FF0000';
        if (PPG.srCode === 'R') color = '#FFA000';

        for (var id1 = 0; id1 < PPG.coords.length - 1; id1++) {
            var pos1 = PPG.coords[id1];
            var pos2 = PPG.coords[id1 + 1];

            var closestPt = getClosestPointOnLine(
                currentLat, currentLng,
                pos1.getLat(), pos1.getLng(),
                pos2.getLat(), pos2.getLng()
            );

            var distance = getDistanceMeter(currentLat, currentLng, closestPt.lat, closestPt.lng);
            if (distance > camDistance) continue;

            cam_pipe.push({
                id0: id0,
                pos1: pos1,
                pos2: pos2,
                cam1: camSpaceOf(pos1),// 카메라 좌표 {dx:오른쪽, dy:위, fwd:앞} (m)
                cam2: camSpaceOf(pos2),
                inner1: false,
                inner2: false,
                visible: false,
                x1: 0, y1: 0, x2: 0, y2: 0,
                color: color
            });
        }
    });

    // 3. 투영 + 그리기. 뒤쪽 끝점은 CAM_NEAR 면에서 잘라 투영. 화면 밖 좌표는 SVG가 알아서 잘라 보여주므로 별도 처리 없음
    cam_pipe.forEach(function(pipe) {
        var a = pipe.cam1;
        var b = pipe.cam2;
        if (a.fwd < CAM_NEAR && b.fwd < CAM_NEAR) return;// 둘 다 카메라 뒤
        if (a.fwd < CAM_NEAR) a = clipNear(a, b);
        if (b.fwd < CAM_NEAR) b = clipNear(b, a);

        var p1 = camPx(a);
        var p2 = camPx(b);
        pipe.x1 = p1.x; pipe.y1 = p1.y;
        pipe.x2 = p2.x; pipe.y2 = p2.y;
        pipe.inner1 = pipe.cam1.fwd >= CAM_NEAR && camInner(p1.x, p1.y);// 잘린 끝점은 inner 아님
        pipe.inner2 = pipe.cam2.fwd >= CAM_NEAR && camInner(p2.x, p2.y);
        pipe.visible = pipe.inner1 || pipe.inner2 || camInner((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);

        lineDraw(pipe.x1, pipe.y1, pipe.x2, pipe.y2, pipe.color, camSVG);
        if (pipe.inner1) camDot(pipe.x1, pipe.y1, pipe.color);
        if (pipe.inner2) camDot(pipe.x2, pipe.y2, pipe.color);
    });

    // 4. 라벨: 화면에 보이는 세그먼트가 있는 배관만 → 연결 그룹 → 그룹 내 최장 배관 중간에 1개
    var visiblePPGs = [];
    var visiblePPGIds = new Set();

    cam_pipe.forEach(function(pipe) {
        if (pipe.visible && !visiblePPGIds.has(pipe.id0)) {
            visiblePPGIds.add(pipe.id0);
            visiblePPGs.push(PPG_all[pipe.id0]);
        }
    });

    if (visiblePPGs.length === 0) return;

    groupConnected(visiblePPGs).forEach(function(group) {
        var ttPPG = group.reduce(function(max, curr) {
            var maxLen = parseFloat(max.plineLt) || 0;
            var currLen = parseFloat(curr.plineLt) || 0;
            return currLen > maxLen ? curr : max;
        }, group[0]);

        var midIdx = Math.floor((ttPPG.coords.length - 1) / 2);
        var p1 = ttPPG.coords[midIdx];
        var p2 = ttPPG.coords[midIdx + 1] || p1;

        var centerPos = (ttPPG.srCode === 'S')
            ? getPointAtRatio(p1, p2, 0.1)
            : getPointAtRatio(p1, p2, 0.9);

        var c = camSpaceOf(centerPos);
        if (c.fwd < CAM_NEAR) return;
        var p = camPx(c);
        if (!camInner(p.x, p.y)) return;

        var labelClass = (ttPPG.srCode === 'S') ? 'road-s-pipe' : 'road-r-pipe';// 로드뷰 라벨과 같은 스타일(색·굵기·검정 외곽선)

        var foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObj.setAttribute('x', (p.x - 60).toFixed(1));// 너비 절반만큼 왼쪽 (중앙 정렬)
        foreignObj.setAttribute('y', (p.y - 20).toFixed(1));// 높이 절반만큼 위
        foreignObj.setAttribute('width', '120');
        foreignObj.setAttribute('height', '40');
        foreignObj.innerHTML = `
            <div class="${labelClass}" style="text-align: center; white-space: nowrap;">
                ${ttPPG.diaCode}A<br>(${ttPPG.LINE_NM})
            </div>
        `;

        camSVG.appendChild(foreignObj);
    });
}

// 위경도 → 카메라 좌표 {dx:오른쪽, dy:위, fwd:앞} (m). camProject 앞부분과 같은 계산 (camRot, cosLat, cmaPos 전역 사용)
function camSpaceOf(pos) {
    var east = (pos.getLng() - cmaPos.lng) * 111320 * cosLat;
    var north = (pos.getLat() - cmaPos.lat) * 111320;
    var up = -CAMERA_HEIGHT;
    var R = camRot;
    return {
        dx: R[0] * east + R[3] * north + R[6] * up,
        dy: R[1] * east + R[4] * north + R[7] * up,
        fwd: -(R[2] * east + R[5] * north + R[8] * up)
    };
}

// 카메라 좌표 → 화면 px. fwd > 0 전제 (camProject 뒷부분과 같은 계산, 화면 밖이어도 값 돌려줌)
function camPx(c) {
    var cs = Math.cos(screenAngle * RAD), sn = Math.sin(screenAngle * RAD);
    return {
        x: camWt / 2 + f * (cs * c.dx - sn * c.dy) / c.fwd,
        y: camHt / 2 - f * (sn * c.dx + cs * c.dy) / c.fwd
    };
}

// 뒤쪽 점 a를 a-b 선분 위에서 fwd = CAM_NEAR 지점으로 이동 (카메라 좌표는 직선이라 선형 보간)
function clipNear(a, b) {
    var t = (CAM_NEAR - a.fwd) / (b.fwd - a.fwd);
    return {
        dx: a.dx + (b.dx - a.dx) * t,
        dy: a.dy + (b.dy - a.dy) * t,
        fwd: CAM_NEAR
    };
}

function camInner(x, y) {
    var margin = 1;
    return (x >= -margin && x <= camWt + margin && y >= -margin && y <= camHt + margin);
}

function camDot(x, y, color) {
    var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x.toFixed(1));
    circle.setAttribute("cy", y.toFixed(1));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", color);
    camSVG.appendChild(circle);
}

// 끝점이 맞닿은(isConnected) 배관끼리 묶기. mapPPG·roadPPG의 BFS와 같은 로직
function groupConnected(list) {
    var visited = new Array(list.length).fill(false);
    var groups = [];

    for (var i = 0; i < list.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(list[curr]);

            for (var j = 0; j < list.length; j++) {
                if (visited[j]) continue;

                if (isConnected(list[curr], list[j])) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }
        groups.push(group);
    }
    return groups;
}

function isConnected(PPG1, PPG2) {
    if (PPG1.diaCode !== PPG2.diaCode) return false;
    if (PPG1.srCode !== PPG2.srCode) return false;

    var p1_start = PPG1.coords[0];
    var p1_end = PPG1.coords[PPG1.coords.length - 1];
    var p2_start = PPG2.coords[0];
    var p2_end = PPG2.coords[PPG2.coords.length - 1];

    return gap_checker(p1_start, p2_start) || gap_checker(p1_start, p2_end) ||
        gap_checker(p1_end, p2_start) || gap_checker(p1_end, p2_end);
}

function gap_checker(pt1, pt2) {
    var dLat = Math.abs(pt1.getLat() - pt2.getLat());
    var dLng = Math.abs(pt1.getLng() - pt2.getLng());
    return (dLat < 0.00005 && dLng < 0.00005);
}

function make_roadPPG_over(pos, PPGidx, pointIdx, PPG) {
    var labelClass = PPG.srCode === 'S' ? 'road-s-pipe' : 'road-r-pipe';

    var element = document.createElement('div');
    element.className = labelClass;
    element.setAttribute('PPGidx', PPGidx);
    element.setAttribute('pointIdx', pointIdx);
    element.innerHTML = '●';

    var overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: element,
        xAnchor: 0.5,
        yAnchor: 0.5
    });    

    overlay.setMap(roadView);
    roadPPG_over.push(overlay);

    return element;
}

function lineDraw(x1, y1, x2, y2, color, svg){
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('opacity', '0.85');
    svg.appendChild(line);
}

function findVisibleTempPoint(pos1, pos2, PPGidx) {
    var ratios = [0.8,0.5,0.2,0.05];

    for (var i = 0; i < ratios.length; i++) {
        var point = getPointAtRatio(pos1,pos2,ratios[i]);

        var tempElement = make_roadPPG_over(point,PPGidx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;

        tempElement.remove();

        if (visible) return {point: point, x: tx, y: ty};
    }

    return null;
}

function findVisibleTempPoint2(pos1, pos2, PPGidx) {
    var ratios1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    var ratios2 = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
    var visiblePoint1 = null;
    var visiblePoint2 = null;

    for (var i = 0; i < ratios1.length; i++) {
        var point = getPointAtRatio(pos1,pos2,ratios1[i]);
        var tempElement = make_roadPPG_over(point,PPGidx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;
        
        if (visible){
            visiblePoint1 = {point: point,x: tx,y: ty};
            break;
        }
        else tempElement.remove();
    }
    for (var i = 0; i < ratios2.length; i++) {
        var point = getPointAtRatio(pos2,pos1,ratios2[i]);
        var tempElement = make_roadPPG_over(point,PPGidx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;
        
        if (visible){
            visiblePoint2 = {point: point,x: tx,y: ty};
            break;
        }
        else tempElement.remove();
    }

    return {
        point1: visiblePoint1,
        point2: visiblePoint2
    };
}

function extendToRectEdge(x1, y1, dx, dy, targetWidth, targetHeight) {
    var candidates = [];

    if (dx > 0) {
        var t = (targetWidth - x1) / dx;
        if (t >= 0) {
            var y = y1 + dy * t;
            if (y >= 0 && y <= targetHeight) {
                candidates.push({ t: t, x: targetWidth, y: y });
            }
        }
    }
    else if (dx < 0) {
        var t = (0 - x1) / dx;
        if (t >= 0) {
            var y = y1 + dy * t;
            if (y >= 0 && y <= targetHeight) {
                candidates.push({ t: t, x: 0, y: y });
            }
        }
    }

    if (dy > 0) {
        var t = (targetHeight - y1) / dy;
        if (t >= 0) {
            var x = x1 + dx * t;
            if (x >= 0 && x <= targetWidth) {
                candidates.push({ t: t, x: x, y: targetHeight });
            }
        }
    }
    else if (dy < 0) {
        var t = (0 - y1) / dy;
        if (t >= 0) {
            var x = x1 + dx * t;
            if (x >= 0 && x <= targetWidth) {
                candidates.push({ t: t, x: x, y: 0 });
            }
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) { return a.t - b.t; });
    return candidates[0];
}
