var MH_all = [];
var mapHM_Over = [];
var roadHM_Over = [];

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

        var columns = line.split(',');

        var name = columns[0] ? columns[0].trim() : '';
        var lng = columns[1] ? parseFloat(columns[1].trim()) : 0;
        var lat = columns[2] ? parseFloat(columns[2].trim()) : 0;

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            MH_all.push({
                name: name,
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 맨홀 좌표 변환 실패:", e);
        }
    }
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
        if (mapBounds.contain(mh.position)) {// 현재 화면 범위 안에 위치하는지 체크
            // CustomOverlay HTML 내용 (아이콘 + 하단 글씨)
            var content = `
                <div class="mh-overlay">
                    <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                    <span class="mh-label">${mh.name}</span>
                </div>
            `;

            var customOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            customOverlay.setMap(map);
            mapHM_Over.push(customOverlay);
        }
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
                <div class="mh-overlay" style="cursor:pointer;">
                    <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                    <span class="mh-label">${mh.name} (${Math.round(dist)}m)</span>
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

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, width, height, f, screenAngle);
        if (!p) return;// 카메라 뒤쪽 또는 화면 밖
        drawn.push({x: p.x, y: p.y, mh: mh});

        // 시험용: foreignObject와 별개로 순수 SVG 점
        //var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        //dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("r", 6); dot.setAttribute("fill", "red");
        //camSVG.appendChild(dot);

        var content = `
            <div class="mh-overlay" style="cursor:pointer;">
                <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                <span class="mh-label">${mh.name} (${Math.round(dist)}m)</span>
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