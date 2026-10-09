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

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var coordStartIndex = line.indexOf('"[');
        var coordEndIndex = line.lastIndexOf(']"');

        if (coordStartIndex === -1 || coordEndIndex === -1) continue;

        var propertiesPart = line.substring(0, coordStartIndex);
        var columns = propertiesPart.split(',');

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

    for (var i = 0; i < PPG_all.length; i++) {
        var PPG = PPG_all[i];

        if (mapBounds.intersects(PPG.bounds)) {
            var lineColor = '#FF0000';
            if (PPG.srCode === 'R') lineColor = '#FFA000';
            else if (PPG.srCode !== 'S') lineColor = '#888888';

            var poly = new kakao.maps.Polyline({
                path: PPG.coords,
                strokeWeight: 1,
                strokeColor: lineColor,
                strokeStyle: 'solid'
            });

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
        }
    }

    if (map.getLevel() >= 3) return;
    if (PPG_on.length === 0) return;

    var visited = new Array(PPG_on.length).fill(false);
    var idx_groups = [];
    
    for (var i = 0; i < PPG_on.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(curr);

            for (var j = 0; j < PPG_on.length; j++) {
                if (visited[j]) continue;

                if (isConnected(PPG_on[curr], PPG_on[j])) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }
        idx_groups.push(group);
    }

    for (var g = 0; g < idx_groups.length; g++) {
        var groupIndices = idx_groups[g];

        var ttIndex = groupIndices.reduce(function(maxIdx, currIdx) {
            var maxLen = parseFloat(PPG_on[maxIdx].plineLt) || 0;
            var currLen = parseFloat(PPG_on[currIdx].plineLt) || 0;
            return currLen > maxLen ? currIdx : maxIdx;
        }, groupIndices[0]);

        var ttPPG = PPG_on[ttIndex];
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
    }
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

    var visited = new Array(visiblePPGs.length).fill(false);
    var groups = [];

    for (var i = 0; i < visiblePPGs.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(visiblePPGs[curr]);

            for (var j = 0; j < visiblePPGs.length; j++) {
                if (visited[j]) continue;

                if (isConnected(visiblePPGs[curr], visiblePPGs[j])) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }
        groups.push(group);
    }

    groups.forEach(function(group) {
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

        var labelText = ttPPG.diaCode + 'A' + ' ('+ ttPPG.LINE_NM +')';
        var labelClass = (ttPPG.srCode === 'S') ? 'road-s-pipe' : 'road-r-pipe';
        var labelColor = (ttPPG.srCode === 'S') ? '#FF0000' : '#FFA000';
        var bgColor = '#000000';

        var textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textNode.setAttribute('x', x.toFixed(1));
        textNode.setAttribute('y', y.toFixed(1));
        textNode.setAttribute('fill', labelColor);
        textNode.setAttribute('stroke', bgColor);
        textNode.setAttribute('paint-order', 'stroke fill');
        textNode.setAttribute('class', labelClass);
        textNode.setAttribute('text-anchor', 'middle');
        textNode.setAttribute('dominant-baseline', 'middle');
        textNode.textContent = labelText;

        roadSVG.appendChild(textNode);
        roadPPG_label.push(textNode);
    });
}

// ★ 캐시 방식 적용된 camPPG
function camPPG() {
    if (!cmaPos || !camRot || !camSVG) return;
    camSVG.innerHTML = '';

    var currentLat = cmaPos.lat;
    var currentLng = cmaPos.lng;

    // 1. 30m 이동 여부 확인 및 60m 캐시 바운딩 영역 생성
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

    // 2. 전체 배관(PPG_all) 대신 60m 캐시 리스트(PPG_camOn)만 2D 투영 및 세그먼트 생성
    PPG_camOn.forEach(function(item) {
        var PPG = item.ppg;
        if (!PPG.coords || PPG.coords.length < 2) return;

        var color = '#888888';
        if (PPG.srCode === 'S') color = '#FF0000';
        else if (PPG.srCode === 'R') color = '#FFA000';

        for (var i = 0; i < PPG.coords.length - 1; i++) {
            var pos1 = PPG.coords[i];
            var pos2 = PPG.coords[i + 1];

            var east1 = (pos1.getLng() - currentLng) * 111320 * cosLat;
            var north1 = (pos1.getLat() - currentLat) * 111320;
            var dist1 = Math.hypot(east1, north1);

            var east2 = (pos2.getLng() - currentLng) * 111320 * cosLat;
            var north2 = (pos2.getLat() - currentLat) * 111320;
            var dist2 = Math.hypot(east2, north2);

            if (dist1 > camDistance && dist2 > camDistance) continue;

            var p1 = camProject(camRot, east1, north1, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
            var p2 = camProject(camRot, east2, north2, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);

            if (!p1) return;
            var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", p1.x.toFixed(1));
            circle.setAttribute("cy", p1.y.toFixed(1));
            circle.setAttribute("r", "5");
            circle.setAttribute("fill", color);
            camSVG.appendChild(circle);

            if (!p2) return;
            var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", p2.x.toFixed(1));
            circle.setAttribute("cy", p2.y.toFixed(1));
            circle.setAttribute("r", "5");
            circle.setAttribute("fill", color);
            camSVG.appendChild(circle);

            function isCamScreenInner(x, y) {
                var margin = 1;
                return (x >= -margin && x <= camWt + margin && y >= -margin && y <= camHt + margin);
            }

            var inner1 = p1 && isCamScreenInner(p1.x, p1.y);
            var inner2 = p2 && isCamScreenInner(p2.x, p2.y);

            if (inner1 && inner2) {
                lineDraw(p1.x, p1.y, p2.x, p2.y, color, camSVG);
            }
            else if (inner1 && p2) {
                var dx = p2.x - p1.x;
                var dy = p2.y - p1.y;
                var end = extendToRectEdge(p1.x, p1.y, dx, dy, camWt, camHt);
                lineDraw(p1.x, p1.y, end.x, end.y, color, camSVG);
            }
            else if (inner2 && p1) {
                var dx = p1.x - p2.x;
                var dy = p1.y - p2.y;
                var end = extendToRectEdge(p2.x, p2.y, dx, dy, camWt, camHt);
                lineDraw(p2.x, p2.y, end.x, end.y, color, camSVG);
            }
            else if (p1 && p2) {
                var end1 = extendToRectEdge(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y, camWt, camHt);
                var end2 = extendToRectEdge(p2.x, p2.y, p1.x - p2.x, p1.y - p2.y, camWt, camHt);
                if (end1 && end2) {
                    lineDraw(end1.x, end1.y, end2.x, end2.y, color, camSVG);
                }
            }
        }
    });

    var visiblePPGs = [];
    var visiblePPGIds = new Set();

    PPG_camOn.forEach(function(item) {
        var PPG = item.ppg;
        var id0 = item.originalId;

        if (!PPG.coords || PPG.coords.length < 2) return;

        var isNear = PPG.coords.some(function(pos) {
            var east = (pos.getLng() - currentLng) * 111320 * cosLat;
            var north = (pos.getLat() - currentLat) * 111320;
            return Math.hypot(east, north) <= camDistance;
        });

        if (isNear && !visiblePPGIds.has(id0)) {
            visiblePPGIds.add(id0);
            visiblePPGs.push(PPG);
        }
    });

    if (visiblePPGs.length === 0) return;

    var visited = new Array(visiblePPGs.length).fill(false);
    var groups = [];

    for (var i = 0; i < visiblePPGs.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(visiblePPGs[curr]);

            for (var j = 0; j < visiblePPGs.length; j++) {
                if (visited[j]) continue;

                if (isConnected(visiblePPGs[curr], visiblePPGs[j])) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }
        groups.push(group);
    }

    groups.forEach(function(group) {
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

        var east = (centerPos.getLng() - currentLng) * 111320 * cosLat;
        var north = (centerPos.getLat() - currentLat) * 111320;
        
        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);

        if (!p || p.x < 0 || p.x > camWt || p.y < 0 || p.y > camHt) return;

        var labelText = ttPPG.eqpId + ' (' + ttPPG.diaCode + 'A)';
        var labelClass = (ttPPG.srCode === 'S') ? 'cam-s-pipe' : 'cam-r-pipe';
        var labelColor = (ttPPG.srCode === 'S') ? '#FF0000' : '#FFA000';
        var bgColor = '#000000';

        var textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textNode.setAttribute('x', p.x.toFixed(1));
        textNode.setAttribute('y', p.y.toFixed(1));
        textNode.setAttribute('fill', labelColor);
        textNode.setAttribute('stroke', bgColor);
        textNode.setAttribute('paint-order', 'stroke fill');
        textNode.setAttribute('class', labelClass);
        textNode.setAttribute('text-anchor', 'middle');
        textNode.setAttribute('dominant-baseline', 'middle');
        textNode.textContent = labelText;

        camSVG.appendChild(textNode);
    });
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