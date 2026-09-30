var all_PPG = [];
var on_PPG = [];
var Poly_ = []; 
var mapOver_ = [];

var all_MH = [];

// CSV 파일 읽어오기
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
    all_PPG = [];

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

            all_PPG.push({
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
    PPG_map();
}

function PPG_map(){
    clearPPG();
    drawPPG();
    labelPPG();
}

// 배관 관련 그래픽 요소를 화면에서 제거
function clearPPG() {
    for (var idx = 0; idx < mapOver_.length; idx++) {
        mapOver_[idx].setMap(null);
    }
    for (var idx = 0; idx < Poly_.length; idx++) {
        Poly_[idx].setMap(null);
    }
    mapOver_ = [];
    Poly_ = [];
    on_PPG = [];
}

// 지도 레벨/영역 조건에 맞는 배관 선 그리기
function drawPPG() {
    if (!map || all_PPG.length === 0) return;
    if (map.getLevel() >= 5) return;

    var mapBounds = map.getBounds();

    for (var i = 0; i < all_PPG.length; i++) {
        var PPG = all_PPG[i];

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
            Poly_.push(poly);
            on_PPG.push(PPG);
        }
    }
}
// 그룹화 알고리즘 및 라벨 표출
function labelPPG() {
    if (map.getLevel() >= 3) return;
    if (on_PPG.length === 0) return;

    var visited = new Array(on_PPG.length).fill(false);
    var idx_groups = [];
    
    for (var i = 0; i < on_PPG.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(curr);

            for (var j = 0; j < on_PPG.length; j++) {
                if (visited[j]) continue;

                if (isConnected(on_PPG[curr], on_PPG[j])) {
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
            var maxLen = parseFloat(on_PPG[maxIdx].plineLt) || 0;
            var currLen = parseFloat(on_PPG[currIdx].plineLt) || 0;
            return currLen > maxLen ? currIdx : maxIdx;
        }, groupIndices[0]);

        var ttPPG = on_PPG[ttIndex];
        //if (ttPPG.srCode === 'R') continue; //극단적
        //var midCoordIndex = Math.floor(ttPPG.path.length / 2);
        //var midCoordIndex = Math.ceil(ttPPG.coords.length / 2);
        var midCoordIndex = Math.round(ttPPG.coords.length / 2);
        //if (ttPPG.srCode === 'R' && midCoordIndex >= 1) midCoordIndex -= 1;
        var centerPosition = ttPPG.coords[midCoordIndex];

        var overlay = null;
        if (ttPPG.srCode === 'S'){
            var overlayContent = '<div class="pipe-s-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }
        if (ttPPG.srCode === 'R'){
            var overlayContent = '<div class="pipe-r-label">' + ttPPG.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.5
            });
        }

        overlay.setMap(map);
        mapOver_.push(overlay);
    }
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

//MH/////////////////////////////////////////////
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
    all_MH = [];

    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = line.split(',');

        var name = columns[0] ? columns[0].trim() : '';
        var lng = columns[1] ? parseFloat(columns[1].trim()) : 0;
        var lat = columns[2] ? parseFloat(columns[2].trim()) : 0;

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            all_MH.push({
                name: name,
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 맨홀 좌표 변환 실패:", e);
        }
    }
    MH_map();
}

//좌표 수식 관련/////////////////////////////////////////////
// 점 P(lat, lng)에서 선분 AB(aLat, aLng ~ bLat, bLng)까지의 최단 좌표 H 구하기
function getClosestPointOnLine(pLat, pLng, aLat, aLng, bLat, bLng) {
    var dx = bLng - aLng;
    var dy = bLat - aLat;

    // A와 B가 동일한 점인 경우
    if (dx === 0 && dy === 0) return { lat: aLat, lng: aLng };

    // 선분 AB 상에서 P의 투영 위치 비율 t 계산
    var t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy);

    // t 범위에 따른 최단점 선택
    if (t <= 0) return { lat: aLat, lng: aLng };
    if (t >= 1) return { lat: bLat, lng: bLng };

    return {lat: aLat + t * dy, lng: aLng + t * dx};
}
// 두 좌표 간의 직선 거리(m) 계산 함수 (Haversine Formula)
function getDistanceMeter(lat1, lng1, lat2, lng2) {
    var R = 6371000; // 지구 반지름 (m)
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// 두 지점 간 방위각 계산 함수 (0°~360°, 북쪽=0, 동쪽=90)
function getBearing(lat1, lng1, lat2, lng2) {
    var radLat1 = lat1 * Math.PI / 180;
    var radLat2 = lat2 * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;

    var y = Math.sin(dLng) * Math.cos(radLat2);
    var x = Math.cos(radLat1) * Math.sin(radLat2) -
            Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLng);

    var bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // 0 ~ 360도로 정규화
}
// 두 지점 사이의 비율 좌표 구하기
function getPointAtRatio(pos1, pos2, ratio) {
    var lat1 = pos1.getLat();
    var lng1 = pos1.getLng();

    var lat2 = pos2.getLat();
    var lng2 = pos2.getLng();

    var lat = lat1 + (lat2 - lat1) * ratio;
    var lng = lng1 + (lng2 - lng1) * ratio;

    return new kakao.maps.LatLng(lat, lng);
}