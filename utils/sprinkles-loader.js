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
 * AST에서 객체의 키값들을 추출하는 헬퍼 함수
 */
function extractObjectKeys(node) {
  const keys = [];
  if (node && node.type === 'ObjectExpression') {
    node.properties.forEach(prop => {
      if (prop.key) {
        const keyName = prop.key.type === 'Identifier'
          ? prop.key.name
          : (prop.key.type === 'StringLiteral' || prop.key.type === 'Literal')
            ? prop.key.value
            : null;
        if (keyName) {
          keys.push(keyName);
        }
      }
    });
  }
  return keys;
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
                // 외부 객체 참조 (theme.colors 등)
                // MemberExpression이면 일단 스킵하고 나중에 실제 객체를 찾아서 처리
                properties[propName] = 'pending-resolution';
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

  // pending-resolution인 항목들을 다시 순회하여 실제 객체 찾기
  Object.keys(properties).forEach(propName => {
    if (properties[propName] === 'pending-resolution') {
      // colors나 backgroundColor 속성인 경우
      if (propName === 'color' || propName === 'backgroundColor') {
        // AST를 다시 순회하여 해당 속성에 연결된 실제 객체 찾기
        const colorKeys = findColorKeysInAST(ast);
        if (colorKeys.length > 0) {
          properties[propName] = colorKeys;
        } else {
          // 키를 찾을 수 없으면 해당 속성 제거
          delete properties[propName];
        }
      } else {
        // 다른 속성은 제거
        delete properties[propName];
      }
    }
  });

  return properties;
}

/**
 * AST에서 색상 관련 객체의 키들을 찾는 함수
 */
function findColorKeysInAST(ast) {
  const keys = [];

  function traverse(node) {
    if (!node || typeof node !== 'object') return;

    // colors나 backgroundColor 같은 이름의 객체 찾기
    if (node.type === 'VariableDeclarator') {
      const varName = node.id && node.id.name;

      // colors, color, backgroundColor 등의 변수명 찾기
      if (varName && (varName === 'colors' || varName === 'color' ||
          varName === 'backgroundColor' || varName === 'backgroundColors')) {
        if (node.init && node.init.type === 'ObjectExpression') {
          keys.push(...extractObjectKeys(node.init));
        }
      }
    }

    // 객체 프로퍼티에서도 찾기
    if (node.type === 'ObjectExpression') {
      node.properties.forEach(prop => {
        const propKey = prop.key && (prop.key.name || prop.key.value);
        if (propKey && (propKey === 'colors' || propKey === 'color' ||
            propKey === 'backgroundColor' || propKey === 'backgroundColors')) {
          if (prop.value && prop.value.type === 'ObjectExpression') {
            keys.push(...extractObjectKeys(prop.value));
          }
        }
      });
    }

    // 재귀적으로 순회
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
  return [...new Set(keys)]; // 중복 제거
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
    // 폴백 없이 빈 객체 반환
    return {};
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
    return {};
  }
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

  // 색상 속성이고 배열로 저장된 경우 (실제 색상 키들)
  if (Array.isArray(allowedValues) && (property === 'color' || property === 'backgroundColor')) {
    // 배열에 포함된 색상 키값만 허용
    return allowedValues.includes(value);
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