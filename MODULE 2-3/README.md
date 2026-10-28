# 수제 디저트 쇼핑몰 – 상품 목록 화면

> **AIFFEL AI 에이전트 3기**
> 모듈 2. 바이브 코딩으로 웹 서비스 개발하기 – 3번 실습

Next.js로 만든 수제 디저트 쇼핑몰의 상품 목록 화면입니다. 백엔드 없이 목업 파일(`data/products.json`)의 상품 6개를 읽어 목록으로 보여 줍니다.

## 바로가기

- 🌐 **배포된 화면:** https://skygaul.github.io/my-dessert-shop/
- 💻 **소스 코드:** https://github.com/skygaul/my-dessert-shop

## 화면 구성

- 상품 6개의 이름, 원 단위 가격, 분류, 이미지를 카드로 표시합니다.
- `image`가 빈 문자열이면 "이미지 없음"을 표시합니다.
- `soldOut`이 `true`인 상품(초콜릿 케이크, 바닐라 마카롱)에는 "품절"을 표시하고 흐리게 처리합니다.
- 목록 항목의 고유 식별자(`key`)로 `id`를 사용합니다.

## 구현 범위

| 구현함 | 구현하지 않음 |
|---|---|
| 목업 파일(`data/products.json`)을 읽는 상품 목록 | 백엔드, 데이터베이스 |
| 이미지 없음 · 품절 표시 | 주문, 결제 |
| GitHub Pages 정적 배포 | 재고 관리, 외부 API 연동 |

## 사용 기술

- Next.js (App Router), React
- GitHub Actions + GitHub Pages (정적 export)

## 주요 파일

| 경로 | 설명 |
|---|---|
| `package.json` | Next.js 의존성과 실행 명령 |
| `data/products.json` | 상품 목업 데이터 (id, name, price, category, image, soldOut) |
| `app/page.js` | 상품 데이터를 읽어 목록을 그리는 화면 |
| `public/images/` | 디저트 이미지 6장 |
| `next.config.mjs` | 정적 export와 GitHub Pages 하위 경로 설정 |
| `.github/workflows/deploy.yml` | `main` 푸시 시 자동 배포 |

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

## 이후 확장

목업 파일 대신 실제 상품 API를 연결하려면 데이터를 가져오는 부분을 교체하고, 로딩·빈 목록·오류 상태 처리를 추가해야 합니다.
