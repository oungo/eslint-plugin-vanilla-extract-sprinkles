/**
 * sprinkles.css.ts에서 정의된 속성과 값들을 파싱하는 유틸리티
 */
import { isSprinklesValue as dynamicIsSprinklesValue } from './sprinkles-loader.js';

/**
 * style 객체에서 sprinkles로 이동할 수 있는 속성들을 추출
 */
export function extractSprinklesProperties(styleProperties) {
  const sprinklesProps = {};
  const remainingProps = {};

  for (const [key, value] of Object.entries(styleProperties)) {
    if (dynamicIsSprinklesValue(key, value)) {
      sprinklesProps[key] = value;
    } else {
      remainingProps[key] = value;
    }
  }

  return { sprinklesProps, remainingProps };
}

/**
 * AST 노드에서 객체 표현식의 속성들을 추출
 */
export function extractObjectProperties(objectExpression, sourceCode = null) {
  const properties = {};

  if (objectExpression.type !== 'ObjectExpression') {
    return properties;
  }

  for (const prop of objectExpression.properties) {
    if (prop.type === 'Property' && !prop.computed) {
      const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
      let value;

      if (prop.value.type === 'Literal') {
        value = prop.value.value;
      } else if (prop.value.type === 'Identifier') {
        value = prop.value.name;
      } else if (prop.value.type === 'TemplateLiteral') {
        // 템플릿 리터럴의 경우 원본 텍스트 보존
        if (sourceCode) {
          value = {
            type: 'TEMPLATE_LITERAL',
            originalText: sourceCode.getText(prop.value)
          };
        } else {
          value = '__TEMPLATE_LITERAL__';
        }
      } else if (prop.value.type === 'ObjectExpression') {
        // 중첩된 객체 (예: ':hover': { ... })의 경우
        value = extractObjectProperties(prop.value, sourceCode);
      } else {
        // 기타 복잡한 표현식들은 sprinkles에서 처리할 수 없음
        if (sourceCode) {
          value = {
            type: 'COMPLEX_EXPRESSION',
            originalText: sourceCode.getText(prop.value)
          };
        } else {
          value = '__COMPLEX_EXPRESSION__';
        }
      }

      // 모든 속성을 포함시킴
      properties[key] = value;
    }
  }

  return properties;
}