document.addEventListener('DOMContentLoaded', () => {

    // --- (A) 중앙 데이터 및 상태 관리 ---

    // ★ [수정] 4개 물체 플레이스홀더 추가
    const objectProperties = {
        // (질량과 부피 설정)
        'iron-small': { mass: 79.0, volume: 10.0 },
        'iron-large': { mass: 158.0, volume: 20.0 },
        'alu-small':  { mass: 27.0, volume: 10.0 },
        'alu-large':  { mass: 54.0, volume: 20.0 },
        'sus-50g':   { mass: 50.0, volume: 6.67 },  // 50 / 7.5
        'sus-100g':  { mass: 100.0, volume: 13.33 }, // 100 / 7.5
        'brass-50g': { mass: 50.0, volume: 5.88 },  // 50 / 8.5
        'brass-100g':{ mass: 100.0, volume: 11.76 }  // 100 / 8.5
    };

    // DOM 요소 가져오기
    const draggableObjects = document.querySelectorAll('.object-item');
    const objectPool = document.getElementById('object-pool');
    
    // 저울(Scale) 관련 요소
    const massDisplay = document.getElementById('mass-display');
    const weighingPan = document.getElementById('weighing-pan');
    const powerButton = document.getElementById('power-button');
    const zeroButton = document.getElementById('zero-button');
    const settingsButton = document.getElementById('settings-button');

    // 실린더(Cylinder) 관련 요소
    const tank = document.getElementById('tank');
    const waterLevel = document.getElementById('water-level');
    const submergedObjectsContainer = document.getElementById('submerged-objects-container');
    const waterLevelSlider = document.getElementById('waterLevelSlider');
    const currentVolumeDisplay = document.getElementById('current-volume-display');
    
    // 실린더 상수
    const pxPerMl = 2; // 1mL 당 픽셀 높이 (400px / 200mL)
    const maxVolumeMl = 200;

    // 저울 상태 변수
    let objectsOnScale = []; 
    let isScaleOn = false;
    let isCalibrating = false;
    let settingsPressTimer = null;
    let initialOffset = 0.0;
    let tareOffset = 0.0;

    // 실린더 상태 변수
    let objectsInTank = []; 
    
    // 드래그 상태 변수
    let activeObject = null;
    let offsetX, offsetY;

    // 각 물체의 '고향' 위치를 저장할 Map
    const objectHomeMap = new Map();
    // ★ (수정 불필요) querySelectorAll이 새 물체를 자동으로 포함합니다.
    document.querySelectorAll('#object-pool .object-item').forEach(obj => {
        objectHomeMap.set(obj, obj.parentElement); 
    });


    // --- (B) 헬퍼 함수 ---

    function getProperties(element) {
        if (!element) return null;
        const type = element.dataset.type;
        // ★ (수정 불필요) objectProperties에서 새 키를 찾아 반환합니다.
        return objectProperties[type] || null;
    }

    function getMassOfElement(element) {
        return getProperties(element)?.mass || 0;
    }

    function getVolumeOfElement(element) {
        return getProperties(element)?.volume || 0;
    }

    function isOverElement(draggedEl, targetEl) {
        const draggedRect = draggedEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        
        const centerX = draggedRect.left + draggedRect.width / 2;
        const centerY = draggedRect.top + draggedRect.height / 2;

        return (
            centerX > targetRect.left && centerX < targetRect.right &&
            centerY > targetRect.top && centerY < targetRect.bottom
        );
    }

    function getEventCoords(e) {
        if (e.touches && e.touches.length) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.changedTouches && e.changedTouches.length) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }


    // --- (C) 저울(Scale) 로직 ---

    function updateMassDisplay() {
        if (!isScaleOn) {
            massDisplay.textContent = '';
            return;
        }
        if (isCalibrating) {
            massDisplay.textContent = 'CAL';
            return;
        }
        
        const currentMass = objectsOnScale.reduce((total, obj) => total + getMassOfElement(obj), 0);
        let displayMass = (currentMass + initialOffset) - tareOffset;
        
        let displayText = displayMass.toFixed(1);
        if (displayText === '-0.0') {
            displayText = '0.0';
        }
        massDisplay.textContent = `${displayText} g`;
    }
    
    powerButton.addEventListener('click', () => {
        isScaleOn = !isScaleOn;
        if (isScaleOn) {
            initialOffset = (Math.random() * 0.4 - 0.2);
            const massOnPanAtPowerOn = objectsOnScale.reduce((total, obj) => total + getMassOfElement(obj), 0);
            tareOffset = massOnPanAtPowerOn + initialOffset;
        } else {
            isCalibrating = false;
        }
        updateMassDisplay();
    });
    zeroButton.addEventListener('click', () => {
        if (isScaleOn && !isCalibrating) {
            const currentMass = objectsOnScale.reduce((total, obj) => total + getMassOfElement(obj), 0);
            tareOffset = currentMass + initialOffset;
            updateMassDisplay();
        }
    });
    function startSettingsPress() {
        if (!isScaleOn) return;
        settingsPressTimer = setTimeout(() => {
            isCalibrating = true;
            updateMassDisplay();
        }, 2000);
    }
    function endSettingsPress() { clearTimeout(settingsPressTimer); }
    settingsButton.addEventListener('mousedown', startSettingsPress);
    settingsButton.addEventListener('mouseup', endSettingsPress);
    settingsButton.addEventListener('mouseleave', endSettingsPress);
    settingsButton.addEventListener('touchstart', startSettingsPress);
    settingsButton.addEventListener('touchend', endSettingsPress);
    settingsButton.addEventListener('touchcancel', endSettingsPress);


    // --- (D) 실린더(Cylinder) 로직 ---

    function updateWaterLevel() {
        const baseWaterLevelMl = parseInt(waterLevelSlider.value);
        
        const addedVolumeMl = objectsInTank.reduce((total, obj) => {
            return total + getVolumeOfElement(obj);
        }, 0);
        
        const totalVolumeMl = baseWaterLevelMl + addedVolumeMl;
        const totalHeight = totalVolumeMl * pxPerMl;
        waterLevel.style.height = totalHeight + 'px';

        waterLevelSlider.disabled = objectsInTank.length > 0;

        currentVolumeDisplay.textContent = `현재 물의 부피: ${totalVolumeMl.toFixed(2)} mL`;
    }
    
    waterLevelSlider.addEventListener('input', () => {
        updateWaterLevel();
    });
    waterLevelSlider.addEventListener('mousedown', () => {
        if (waterLevelSlider.disabled) {
            alert("메스실린더 안에 물체를 모두 꺼내주세요.");
        }
    });
    waterLevelSlider.addEventListener('touchstart', () => {
        if (waterLevelSlider.disabled) {
            alert("메스실린더 안에 물체를 모두 꺼내주세요.");
        }
    });
    
    for (let i = 1; i < 100; i++) {
        if (i % 10 === 0) continue;
        const tickClass = (i % 5 === 0) ? 'midtick' : 'subtick';
        const tick = document.createElement('div');
        tick.className = tickClass;
        tick.style.bottom = `${i}%`;
        document.getElementById('scale').appendChild(tick);
    }

    // --- (E) '고향'으로 복귀하는 헬퍼 함수 ---
    function returnHome() {
        if (!activeObject) return;
        const homeContainer = objectHomeMap.get(activeObject); 
        
        if (homeContainer) {
            homeContainer.prepend(activeObject); 
        } else {
            objectPool.appendChild(activeObject); 
        }
    }


    // --- (F) 통합 드래그 앤 드롭 로직 ---

    function dragStart(e) {
        activeObject = e.target.closest('.object-item');
        if (!activeObject) return;
        
        let scaleIndex = objectsOnScale.indexOf(activeObject);
        if (scaleIndex > -1) {
            objectsOnScale.splice(scaleIndex, 1);
        }
        let tankIndex = objectsInTank.indexOf(activeObject);
        if (tankIndex > -1) {
            objectsInTank.splice(tankIndex, 1);
        }

        const coords = getEventCoords(e);
        const rect = activeObject.getBoundingClientRect();
        offsetX = coords.x - rect.left;
        offsetY = coords.y - rect.top;

        document.body.appendChild(activeObject);
        activeObject.classList.add('dragging'); 

        activeObject.style.left = `${coords.x - offsetX}px`;
        activeObject.style.top = `${coords.g - offsetY}px`;
        
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);

        updateMassDisplay();
        updateWaterLevel();
    }

    function dragMove(e) {
        if (!activeObject) return;
        e.preventDefault(); 
        
        const coords = getEventCoords(e);
        const x = coords.x - offsetX;
        const y = coords.y - offsetY;

        activeObject.style.left = `${x}px`;
        activeObject.style.top = `${y}px`;
    }

    function dragEnd(e) {
        if (!activeObject) return;

        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchmove', dragMove, { passive: false });
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchend', dragEnd);

        const onScale = isOverElement(activeObject, weighingPan);
        const inTank = isOverElement(activeObject, tank);

        activeObject.classList.remove('dragging');

        if (onScale) {
            if (!objectsOnScale.includes(activeObject)) {
                objectsOnScale.push(activeObject);
            }
            weighingPan.appendChild(activeObject);
        } 
        else if (inTank) {
            const baseWaterLevelMl = parseInt(waterLevelSlider.value);
            if (baseWaterLevelMl === 0) {
                alert("먼저 메스실린더에 물을 넣어주세요.");
                returnHome(); 
            } else {
                const currentVolumeInTank = objectsInTank.reduce((total, obj) => total + getVolumeOfElement(obj), 0);
                const objectVolume = getVolumeOfElement(activeObject);
                const potentialTotalVolumeMl = baseWaterLevelMl + currentVolumeInTank + objectVolume;
                
                if (potentialTotalVolumeMl > maxVolumeMl) {
                    alert("물이 넘치지 않도록 해주세요.");
                    returnHome(); 
                } else {
                    if (!objectsInTank.includes(activeObject)) {
                        objectsInTank.push(activeObject);
                    }
                    submergedObjectsContainer.appendChild(activeObject);
                }
            }
        } 
        else {
            returnHome();
        }

        activeObject.style.position = 'relative';
        activeObject.style.left = '0';
        activeObject.style.top = '0';

        activeObject = null;

        updateMassDisplay();
        updateWaterLevel();
    }

    // ★ (수정 불필요) querySelectorAll이 새 물체를 자동으로 포함합니다.
    draggableObjects.forEach(obj => {
        obj.draggable = false; 
        
        obj.addEventListener('mousedown', dragStart);
        obj.addEventListener('touchstart', dragStart, { passive: false });
    });

    // --- (G) 초기화 ---
    updateMassDisplay();
    updateWaterLevel(); 
});