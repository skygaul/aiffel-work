# NOVA ARMADA — 100 Stars Conquest

10개 은하 × 10개 미션 = 100 스테이지, 1,000,000점 만점 3D 우주전쟁 아케이드 슈팅 (WebGL2 · Three.js · TypeScript).

## ▶ 바로 플레이
- **GitHub Pages:** https://skygaul.github.io/aiffel-work/quest01-1/

데스크톱 Chrome/Edge 권장 (WebGL2 필요).

## 조작
| 키 | 동작 |
|---|---|
| 마우스 | 조준·선회 / 좌클릭 레이저 / 우클릭 미사일 |
| W / S · A / D | 가속·감속 · 좌우 이동 |
| Shift | 부스트 |
| Space | 회피 대시 (0.25초 무적) |
| E | 유도 미사일 |
| Q | Nova Burst (게이지 100%) |
| Esc / P | 일시정지 |
| R (결과 화면) | 즉시 재도전 |

## URL 옵션
- `?debug=1` FPS·draw call·메모리 오버레이
- `?stage=G03-M05` 해당 스테이지로 바로 진입
- `?autoplay=1&speed=20` 자동 클리어 봇 (마지막 검증: 100/100 첫 시도 클리어)

## 구성
- `index.html`, `assets/` — 빌드된 게임 (그대로 배포)
- `source/` — 소스 코드. `cd source && npm install && npm run dev`
