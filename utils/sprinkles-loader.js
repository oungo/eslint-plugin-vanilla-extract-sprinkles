/**
 * sprinkles.css.ts 파일을 동적으로 파싱하여 속성과 값들을 추출
 */
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import { glob } from 'glob';

let sprinklesPropertiesCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 60000; // 1분 캐싱

/**
 * sprinkles.css.ts 파일을 찾아서 경로 반환
 */
export function findSprinklesFile(projectRoot = process.cwd()) {
  // 일반적인 sprinkles 파일 위치들
  const patterns = [
    '**/sprinkles.css.ts',
    '**/sprinkles.css.js',
    '**/styles/sprinkles.css.ts',
    '**/style/sprinkles.css.ts',
    '**/src/style/sprinkles.css.ts',
    '**/src/styles/sprinkles.css.ts',
  ];

  for (const pattern of patterns) {
    const files = glob.sync(pattern, {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });

    if (files.length > 0) {
      return path.join(projectRoot, files[0]);
    }
  }

  return null;
}

/**
 * AST에서 defineProperties 호출 찾아서 properties 객체 추출
 */
function extractPropertiesFromAST(ast) {
  const properties = {};

  function traverse(node) {
    if (!node || typeof node !== 'object') return;

    // defineProperties 호출 찾기
    if (node.type === 'CallExpression' &&
        node.callee &&
        node.callee.name === 'defineProperties' &&
        node.arguments &&
        node.arguments.length > 0) {

      const arg = node.arguments[0];
      if (arg.type === 'ObjectExpression') {
        // properties 필드 찾기
        const propsProp = arg.properties.find(prop =>
          prop.key && prop.key.name === 'properties'
        );

        if (propsProp && propsProp.value && propsProp.value.type === 'ObjectExpression') {
          // properties 객체 파싱
          propsProp.value.properties.forEach(prop => {
            if (prop.key && prop.key.type === 'Identifier') {
              const propName = prop.key.name;

              // 값 추출
              if (prop.value.type === 'ArrayExpression') {
                // ['value1', 'value2', ...]
                properties[propName] = prop.value.elements
                  .filter(el => el)
                  .map(el => {
                    if (el.type === 'StringLiteral' || el.type === 'Literal') {
                      return el.value;
                    } else if (el.type === 'NumericLiteral') {
                      return el.value;
                    } else if (el.type === 'Literal' && typeof el.value === 'number') {
                      return el.value;
                    }
                    return null;
                  })
                  .filter(v => v !== null);
              } else if (prop.value.type === 'ObjectExpression') {
                // { KEY: value, ... }
                const objValues = {};
                prop.value.properties.forEach(objProp => {
                  if (objProp.key && objProp.value) {
                    const key = objProp.key.name || objProp.key.value;
                    if (objProp.value.type === 'NumericLiteral' ||
                        (objProp.value.type === 'Literal' && typeof objProp.value.value === 'number')) {
                      objValues[key] = objProp.value.value;
                    }
                  }
                });
                if (Object.keys(objValues).length > 0) {
                  properties[propName] = objValues;
                }
              } else if (prop.value.type === 'MemberExpression') {
                // theme.colors 같은 참조
                if (prop.value.object && prop.value.object.name === 'theme' &&
                    prop.value.property && prop.value.property.name === 'colors') {
                  properties[propName] = 'theme-colors';
                }
              }
            }
          });
        }
      }
    }

    // 재귀적으로 자식 노드들 순회
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach(traverse);
        } else {
          traverse(node[key]);
        }
      }
    }
  }

  traverse(ast);
  return properties;
}

/**
 * sprinkles.css.ts 파일에서 속성들을 파싱하여 추출
 */
export function loadSprinklesProperties(projectRoot = process.cwd()) {
  // 캐시 확인
  const now = Date.now();
  if (sprinklesPropertiesCache && (now - lastCacheTime) < CACHE_DURATION) {
    return sprinklesPropertiesCache;
  }

  const sprinklesFile = findSprinklesFile(projectRoot);

  if (!sprinklesFile) {
    console.warn('Could not find sprinkles.css.ts file in project');
    // 기본값 반환
    return getDefaultSprinklesProperties();
  }

  try {
    const content = fs.readFileSync(sprinklesFile, 'utf-8');

    // TypeScript/JSX 코드 파싱
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    const properties = extractPropertiesFromAST(ast);

    // 캐시 업데이트
    sprinklesPropertiesCache = properties;
    lastCacheTime = now;

    return properties;
  } catch (error) {
    console.error(`Error parsing sprinkles file: ${error.message}`);
    return getDefaultSprinklesProperties();
  }
}

/**
 * 기본 sprinkles 속성들 (폴백용)
 */
function getDefaultSprinklesProperties() {
  return {
    position: ['absolute', 'relative', 'fixed', 'sticky', 'static'],
    display: ['none', 'flex', 'inline-flex', 'block', 'inline', 'grid', 'inline-block'],
    flexDirection: ['row', 'column'],
    justifyContent: ['stretch', 'flex-start', 'center', 'flex-end', 'space-around', 'space-between', 'space-evenly'],
    alignItems: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'initial'],
    margin: ['0 auto'],
    width: ['100%', '100vw'],
    height: ['100%', '100vh', 'calc(var(--vh, 1vh) * 100)'],
    textAlign: ['left', 'center', 'right', 'start'],
    overflow: ['auto', 'hidden', 'scroll'],
    borderRadius: [999],
    whiteSpace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'],
    wordBreak: ['normal', 'break-all', 'break-word', 'keep-all'],
    zIndex: {
      BASE: 1,
      STICKY: 100,
      FLOATING: 200,
      FIXED: 300,
      MODAL: 500,
      SNACKBAR: 600,
      HIGHEST: 999,
      BOTTOM_SHEET: 1000,
    },
    color: 'theme-colors',
    backgroundColor: 'theme-colors',
  };
}

/**
 * 주어진 속성이 sprinkles에서 지원되는지 확인
 */
export function isSprinklesProperty(property) {
  const properties = loadSprinklesProperties();
  return Object.prototype.hasOwnProperty.call(properties, property);
}

/**
 * 주어진 속성과 값이 sprinkles에서 지원되는지 확인
 */
export function isSprinklesValue(property, value) {
  if (!isSprinklesProperty(property)) return false;

  // 템플릿 리터럴이나 복잡한 표현식은 sprinkles에서 처리할 수 없음
  if (value === '__TEMPLATE_LITERAL__' || value === '__COMPLEX_EXPRESSION__') {
    return false;
  }

  // 새로운 객체 형태의 템플릿 리터럴/복잡한 표현식 처리
  if (typeof value === 'object' && value !== null &&
      (value.type === 'TEMPLATE_LITERAL' || value.type === 'COMPLEX_EXPRESSION')) {
    return false;
  }

  const properties = loadSprinklesProperties();
  const allowedValues = properties[property];

  // 색상 속성의 경우 특별 처리
  if (allowedValues === 'theme-colors') {
    // 문자열 리터럴이고 컬러 토큰 패턴인지 확인
    if (typeof value === 'string') {
      // 일반적인 색상 토큰 패턴들 (gray-100, blue-500 등)
      return /^[a-z]+-\d+$|^(white|black|transparent)$/.test(value);
    }
    return false;
  }

  // 객체 형태의 값 (zIndex)
  if (typeof allowedValues === 'object' && !Array.isArray(allowedValues)) {
    return Object.prototype.hasOwnProperty.call(allowedValues, value) || Object.values(allowedValues).includes(value);
  }

  // 배열 형태의 값
  if (Array.isArray(allowedValues)) {
    return allowedValues.includes(value);
  }

  return false;
}