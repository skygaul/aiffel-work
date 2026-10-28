# 수제 디저트 쇼핑몰 – 상품 목록 화면

> **AIFFEL AI 에이전트 3기**
> 모듈 2. 바이브 코딩으로 웹 서비스 개발하기 – 3번 실습

Next.js로 만든 수제 디저트 쇼핑몰의 상품 목록 화면입니다. 처음에는 목업 파일(`data/products.json`)을 직접 읽어 상품 6개를 보여 주도록 만들었고, 이후 **`GET /api/products` 요청으로 상품 목록을 받아 오도록 수정했습니다.**

## 수정 내역

- **1차:** `data/products.json`의 상품 6개를 화면에서 직접 읽어 목록으로 표시
- **2차 (수정):** 화면이 `GET /api/products`를 요청해 JSON 배열을 받아 표시하도록 변경하고, 로딩 · 오류 · 빈 목록 상태 처리를 추가

## 바로가기

- 🌐 **배포된 화면:** https://skygaul.github.io/my-dessert-shop/
- 💻 **소스 코드:** https://github.com/skygaul/my-dessert-shop

## 화면 구성

- 상품 6개의 이름, 원 단위 가격, 분류, 이미지를 카드로 표시합니다.
- `image`가 빈 문자열이면 "이미지 없음"을 표시합니다.
- `soldOut`이 `true`인 상품(초콜릿 케이크, 바닐라 마카롱)에는 "품절"을 표시하고 흐리게 처리합니다.
- 목록 항목의 고유 식별자(`key`)로 `id`를 사용합니다.
- 상품을 불러오는 동안 "불러오는 중..."을 표시합니다.
- 요청이 실패하면 오류 안내와 "다시 시도" 버튼을 표시합니다.
- 응답은 성공했지만 배열이 비어 있으면 "등록된 상품이 없습니다."를 표시합니다.

## 데이터가 화면에 표시되는 과정

```
data/products.json  →  GET /api/products  →  ProductsView (요청·상태 관리)  →  ProductList (카드 표시)
```

- 응답은 객체로 감싸지 않은 JSON 배열이며, 각 상품은 `id, name, price, category, image, soldOut` 필드를 가집니다.
- 상품 데이터는 `data/products.json` 한 곳에만 있고, 화면 코드에는 상품 배열이 없습니다.
- 상품 목록 컴포넌트(`ProductList`)는 배열만 전달받으므로, 데이터를 가져오는 방식이 바뀌어도 화면 컴포넌트는 그대로 둘 수 있습니다.

## 상태 확인용 주소 옵션

배포된 화면 주소 뒤에 옵션을 붙이면 각 상태를 재현할 수 있습니다.

| 주소 | 확인하는 상태 |
|---|---|
| `/` | 정상 목록 (상품 6개) |
| `/?delay=3000` | 느린 응답 (3초 동안 "불러오는 중...") |
| `/?empty` | 빈 목록 ("등록된 상품이 없습니다.") |
| `/?fail` | 실패 응답 (HTTP 404 → 오류 안내 + 다시 시도 버튼) |

## 구현 범위

| 구현함 | 구현하지 않음 |
|---|---|
| `GET /api/products` 요청으로 상품 목록 표시 | 별도 백엔드 서버, 데이터베이스 |
| 로딩 · 오류(HTTP 오류 포함) · 빈 목록 처리, 다시 시도 | 주문, 결제 |
| 이미지 없음 · 품절 표시 | 재고 관리 |
| GitHub Pages 정적 배포 | 실제 서버가 요청마다 처리하는 API |

> 이 프로젝트의 `/api/products`는 서버가 요청을 처리하는 방식이 아니라, 빌드할 때 `data/products.json`으로 미리 만들어 두는 정적 응답입니다. 그래서 GitHub Pages에서도 동작합니다.

## 사용 기술

- Next.js (App Router), React
- GitHub Actions + GitHub Pages (정적 export)

## 주요 파일

| 경로 | 설명 |
|---|---|
| `package.json` | Next.js 의존성과 실행 명령 |
| `data/products.json` | 상품 데이터 (id, name, price, category, image, soldOut) |
| `app/api/products/route.js` | `GET /api/products` – 상품 JSON 배열 응답 |
| `app/api/products-empty/route.js` | 빈 목록 확인용 – 빈 배열 응답 |
| `app/ProductsView.js` | API 요청과 로딩 · 오류 · 빈 목록 상태 관리 |
| `app/ProductList.js` | 상품 배열을 받아 카드로 표시 |
| `app/page.js` | 제목과 `ProductsView`를 렌더링하는 화면 |
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

실제 서버 API(데이터베이스에서 상품 조회, 재고 반영 등)가 준비되면 `app/ProductsView.js`의 요청 주소만 바꾸고, 응답을 같은 필드의 JSON 배열로 맞추면 `ProductList`는 그대로 사용할 수 있습니다. 이때는 요청 권한과 서버 저장 여부도 별도로 확인해야 합니다.
