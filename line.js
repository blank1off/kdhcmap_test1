var PPG_all = [];
var PPG_on = []
var mapPPG_poly = []; 
var mapPPG_label = [];

var roadPPG_over = [];
var roadPPG_label = [];
var road_pipe = [];


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
        var cntrwkNm = columns[2] ? columns[2].replace(/^"|"$/g, '').trim() : '';
        var diaCode = parseInt(columns[3], 10) || 0;
        var pipePress = columns[4] ? columns[4].trim() : '';
        var plineLt = columns[5] ? columns[5].trim() : '';
        var competDe = columns[6] ? columns[6].trim() : '';
        var qltyGrade = columns[7] ? columns[7].trim() : '';
        var avgDph = columns[10] ? columns[10].trim() : '';

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
    // 배관 관련 그래픽 요소를 화면에서 제거
    for (var idx = 0; idx < mapPPG_label.length; idx++) {
        mapPPG_label[idx].setMap(null);
    }
    for (var idx = 0; idx < mapPPG_poly.length; idx++) {
        mapPPG_poly[idx].setMap(null);
    }
    mapPPG_label = [];
    mapPPG_poly = [];
    PPG_on = [];

    // 지도 레벨/영역 조건에 맞는 배관 선 그리기
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

            poly.setMap(map);
            mapPPG_poly.push(poly);
            PPG_on.push(PPG);
        }
    }

    // 그룹화 알고리즘 및 라벨 표출
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

    // 그룹 내 최장 배관을 선별해 오버레이 라벨 표출
    for (var g = 0; g < idx_groups.length; g++) {
        var groupIndices = idx_groups[g];

        var ttIndex = groupIndices.reduce(function(maxIdx, currIdx) {
            var maxLen = parseFloat(PPG_on[maxIdx].plineLt) || 0;
            var currLen = parseFloat(PPG_on[currIdx].plineLt) || 0;
            return currLen > maxLen ? currIdx : maxIdx;
        }, groupIndices[0]);

        var ttPPG = PPG_on[ttIndex];
        //if (ttPPG.srCode === 'R') continue; //극단적
        //var midCoordIndex = Math.floor(ttPPG.path.length / 2);
        //var midCoordIndex = Math.ceil(ttPPG.coords.length / 2);
        //var midCoordIndex = Math.round(ttPPG.coords.length / 2);
        //if (ttPPG.srCode === 'R' && midCoordIndex >= 1) midCoordIndex -= 1;
        //var centerPosition = ttPPG.coords[midCoordIndex];

        // 1. 인덱스 범위를 벗어나지 않도록 안전하게 midIndex 계산 (0 ~ length-1)
        var midCoordIndex = Math.floor((ttPPG.coords.length - 1) / 2);

        // 2. 비율 계산을 위한 두 지점(kakao.maps.LatLng) 확보
        var p1 = ttPPG.coords[midCoordIndex];
        var p2 = ttPPG.coords[midCoordIndex + 1] || p1; // 점이 1개뿐일 경우를 대비한 안전 장치
        

        var overlay = null;
        if (ttPPG.srCode === 'S'){
            var centerPosition = getPointAtRatio(p1, p2, 0.1)
            var overlayContent = '<div class="ppg-s-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }
        if (ttPPG.srCode === 'R'){
            var centerPosition = getPointAtRatio(p1, p2, 0.9)
            var overlayContent = '<div class="ppg-r-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }

        // 3. overlay가 정상적으로 생성된 경우에만 지도에 표시
        if (overlay) {
            overlay.setMap(map);
            mapPPG_label.push(overlay);
        }
    }
}

function roadPPG(){
    // 배관 관련 그래픽 요소를 화면에서 제거
    for (var idx = 0; idx < roadPPG_label.length; idx++) {
        roadPPG_label[idx].setMap(null);
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

    PPG_all.forEach(function(PPG, id0) {
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
                id0: id0, // ★ PPG 식별 ID 추가
                el1: element1,
                el2: element2,
                pos1: pos1,
                pos2: pos2,
                inner1: false,
                inner2: false,
                x1:0,y1:0,x2:0,y2:0,
                color: color,
            });
        }
    });

    road_pipe.forEach(function(pipe) {
        var margin = 1;// 화면 안쪽에 있는지 검사시 여유값

        var rect1 = pipe.el1.getBoundingClientRect()
        if (rect1.width === 0 && rect1.height === 0) 
            pipe.inner1 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
        else{
            pipe.x1 = rect1.left + rect1.width / 2 - roadRect.left;
            pipe.y1 = rect1.top + rect1.height / 2 - roadRect.top;

            if (pipe.x1 >= -margin && pipe.x1 <= roadWt + margin &&
                pipe.y1 >= -margin && pipe.y1 <= roadHt + margin) 
                pipe.inner1 = true;
        }

        var rect2 = pipe.el2.getBoundingClientRect()
        if (rect2.width === 0 && rect2.height === 0)
            pipe.inner2 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
        else{
            pipe.x2 = rect2.left + rect2.width / 2 - roadRect.left;
            pipe.y2 = rect2.top + rect2.height / 2 - roadRect.top;

            if (pipe.x2 >= -margin && pipe.x2 <= roadWt + margin &&
                pipe.y2 >= -margin && pipe.y2 <= roadHt + margin) 
                pipe.inner2 = true;
        }

        if (pipe.inner1 && pipe.inner2) 
            lineDraw(pipe.x1, pipe.y1, pipe.x2, pipe.y2, pipe.color);
        if (pipe.inner1 && !pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos1, pipe.pos2, pipe.id0)
            if (tempPoint) {// pos1 → 임시점 방향
                var dx = tempPoint.x - pipe.x1;
                var dy = tempPoint.y - pipe.y1;
                var end = extendToScreenEdge(pipe.x1, pipe.y1, dx, dy);

                lineDraw(pipe.x1, pipe.y1, end.x, end.y, pipe.color);
            }
            
        }
        if (!pipe.inner1 && pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos2,pipe.pos1,pipe.id0)
            if (tempPoint) {// pos1 → 임시점 방향
                var dx = tempPoint.x - pipe.x2;
                var dy = tempPoint.y - pipe.y2;
                var end = extendToScreenEdge(pipe.x2, pipe.y2, dx, dy);

                lineDraw(pipe.x2, pipe.y2, end.x, end.y, pipe.color);
            }
        }
        if (!pipe.inner1 && !pipe.inner2) {
            var tempPoints = findVisibleTempPoint2(pipe.pos1,pipe.pos2,pipe.id0);
            if (tempPoints.point1 && tempPoints.point2) {
                var dx = tempPoints.point1.x - tempPoints.point2.x;
                var dy = tempPoints.point1.y - tempPoints.point2.y;
                var end1 = extendToScreenEdge(tempPoints.point1.x, tempPoints.point1.y, dx, dy);
                var end2 = extendToScreenEdge(tempPoints.point2.x, tempPoints.point2.y, -dx, -dy);

                lineDraw(end1.x, end1.y, end2.x, end2.y, pipe.color);
            }
        }
    });

    //라벨 그리기
    if (road_pipe.length === 0) return;

    // 현재 화면에 노출되는(inner1 혹은 inner2가 참인) 배관 세그먼트의 PPG 고유 목록 추출
    var visiblePPGs = [];
    var visiblePPGIds = new Set();

    road_pipe.forEach(function(pipe) {
        if ((pipe.inner1 || pipe.inner2) && !visiblePPGIds.has(pipe.id0)) {
            visiblePPGIds.add(pipe.id0);
            visiblePPGs.push(PPG_all[pipe.id0]);
        }
    });

    if (visiblePPGs.length === 0) return;

    // 연결성(diaCode, srCode 동일 및 접점 인근) 기반 그룹핑
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

    // 각 그룹별 대표 배관 선출 및 라벨 생성
    groups.forEach(function(group) {
        // 길이가 가장 긴 배관을 대표 배관으로 선별
        var ttPPG = group.reduce(function(max, curr) {
            var maxLen = parseFloat(max.plineLt) || 0;
            var currLen = parseFloat(curr.plineLt) || 0;
            return currLen > maxLen ? curr : max;
        }, group[0]);

        // 중심 좌표 계산
        var midIdx = Math.floor((ttPPG.coords.length - 1) / 2);
        var p1 = ttPPG.coords[midIdx];
        var p2 = ttPPG.coords[midIdx + 1] || p1;

        var centerPos = (ttPPG.srCode === 'S') 
            ? getPointAtRatio(p1, p2, 0.1) 
            : getPointAtRatio(p1, p2, 0.9);

        var labelClass = (ttPPG.srCode === 'S') ? 'road-s-pipe' : 'road-r-pipe';
        var labelContent = '<div class="' + labelClass + '">' + ttPPG.diaCode + 'A</div>';

        var overlay = new kakao.maps.CustomOverlay({
            position: centerPos,
            content: labelContent,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        overlay.setMap(roadView);
        roadPPG_label.push(overlay);
    });
}

function camPPG() {
    if (!cmaPos || !camRot || !camSVG) return;

    PPG_all.forEach(function(PPG) {
        if (!PPG.coords || PPG.coords.length < 2) return;

        // 배관 색상 설정 (S: 빨강, R: 주황, 기타: 회색)
        var color = '#888888';
        if (PPG.srCode === 'S') color = '#FF0000';
        else if (PPG.srCode === 'R') color = '#FFA000';

        PPG.coords.forEach(function(pos) {
            // 현재 내 위치 기준 좌표점까지의 동/북 거리 계산 (m 단위)
            var east = (pos.getLng() - cmaPos.lng) * 111320 * cosLat;
            var north = (pos.getLat() - cmaPos.lat) * 111320;
            var dist = Math.hypot(east, north);

            // 지정된 거리(camDistance) 이내의 점만 투영
            if (dist > camDistance) return;

            // 3D 공간 좌표를 2D 화면 좌표로 투영 (배관은 지면에 위치하므로 -CAMERA_HEIGHT)
            var p = camProject(camRot, east, north, -CAMERA_HEIGHT, width, height, f, screenAngle);
            if (!p) return; // 화면 밖이거나 카메라 뒤쪽에 위치한 경우 무시

            // 점 생성 (SVG circle)
            var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", p.x.toFixed(1));
            circle.setAttribute("cy", p.y.toFixed(1));
            circle.setAttribute("r", "5"); // 점 반지름 (px)
            circle.setAttribute("fill", color);
            circle.setAttribute("opacity", "0.8");

            camSVG.appendChild(circle);
        });
    });
}

// 배관 연결성 검사 보조 함수
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
    return (dLat < 0.00005 && dLng < 0.00005); // 약 1m 이내
}

// 오버레이 생성 후 객체/DOM 참조 반환
function make_roadPPG_over(pos, PPGidx, pointIdx, PPG) {
    var labelClass = PPG.srCode === 'S' ? 'road-s-pipe' : 'road-r-pipe';

    // 1. 문자열 대신 DOM 엘리먼트 생성
    var element = document.createElement('div');
    element.className = labelClass;
    element.setAttribute('PPGidx', PPGidx);
    element.setAttribute('pointIdx', pointIdx);
    element.innerHTML = '●';
    //element.style.opacity = '0';//투명

    // 2. CustomOverlay에 DOM 엘리먼트 전달
    var overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: element, // DOM Element 전달
        xAnchor: 0.5,
        yAnchor: 0.5
    });    

    overlay.setMap(roadView);
    roadPPG_over.push(overlay);

    return element
}

function lineDraw(x1, y1, x2, y2, color){
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('opacity', '0.85');
    roadSVG.appendChild(line);
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
            console.log(visiblePoint1)
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
            console.log(visiblePoint2)
            break;
        }
        else tempElement.remove();
    }

    return {
        point1: visiblePoint1,
        point2: visiblePoint2
    };
}

function extendToScreenEdge(x1, y1, dx, dy) {
    var candidates = [];
    
    //방향 벡터가 0이면 연장할 수 없다.
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.000001) return {x: x1, y: y1};

    //방향 벡터 정규화
    dx /= length;
    dy /= length;

    //오른쪽 경계 x = roadWt
    if (dx > 0) {
        var tRight = (roadWt - x1) / dx;
        if (tRight >= 0) {
            var yRight = y1 + dy * tRight;
            if (yRight >= 0 && yRight <= roadHt) {
                candidates.push({t: tRight,x: roadWt,y: yRight});
            }
        }
    }
    //왼쪽 경계 x = 0
    if (dx < 0) {
        var tLeft = (0 - x1) / dx;
        if (tLeft >= 0) {
            var yLeft = y1 + dy * tLeft;
            if (yLeft >= 0 && yLeft <= roadHt) {
                candidates.push({t: tLeft,x: 0,y: yLeft});
            }
        }
    }
    //아래쪽 경계 y = roadHt
    if (dy > 0) {
        var tBottom = (roadHt - y1) / dy;
        if (tBottom >= 0) {
            var xBottom = x1 + dx * tBottom;;
            if (xBottom >= 0 && xBottom <= roadWt) {
                candidates.push({t: tBottom,x: xBottom,y: roadHt});
            }
        }
    }
    //위쪽 경계 y = 0
    if (dy < 0) {
        var tTop = (0 - y1) / dy;
        if (tTop >= 0) {
            var xTop = x1 + dx * tTop;
            if (xTop >= 0 && xTop <= roadWt) {
                candidates.push({t: tTop,x: xTop,y: 0});
            }
        }
    }

    // 가장 먼 교차점을 선택한다.
    // 현재 점에서 화면 바깥쪽으로
    // 최대한 길게 선을 그린다.

    if (candidates.length === 0) return {x: x1, y: y1};

    candidates.sort(function(a, b) { return b.t - a.t; });

    return {x: candidates[0].x, y: candidates[0].y};
}

