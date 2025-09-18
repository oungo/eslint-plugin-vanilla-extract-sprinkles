import { extractSprinklesProperties, extractObjectProperties } from '../utils/sprinkles-parser.js';

/**
 * style() 호출에서 sprinkles로 이동할 수 있는 속성들을 찾아 경고하고 자동 수정하는 규칙
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer sprinkles over vanilla-extract style for supported properties',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSprinkles: 'Use sprinkles() instead of style() for properties: {{properties}}',
      preferSprinklesInVariants: 'Use sprinkles() instead of style() for properties in styleVariants: {{properties}}',
      preferSprinklesInRecipe: 'Use sprinkles() instead of style() for properties in recipe: {{properties}}',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    /**
     * 객체 표현식을 문자열로 변환 (템플릿 리터럴 원본 보존)
     */
    function objectToString(properties, objectNode = null, indent = '') {
      if (Object.keys(properties).length === 0) return '{}';

      const entries = Object.entries(properties).map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // 템플릿 리터럴이나 복잡한 표현식의 원본 텍스트 보존
          if (value.type === 'TEMPLATE_LITERAL' || value.type === 'COMPLEX_EXPRESSION') {
            return `${indent}  ${key}: ${value.originalText}`;
          }
          // 중첩된 객체 처리 (:hover 등)
          else if (typeof value === 'object' && !value.type) {
            const nestedEntries = Object.entries(value).map(([nestedKey, nestedValue]) => {
              if (typeof nestedValue === 'object' && nestedValue !== null &&
                  (nestedValue.type === 'TEMPLATE_LITERAL' || nestedValue.type === 'COMPLEX_EXPRESSION')) {
                return `    ${nestedKey}: ${nestedValue.originalText}`;
              }
              const formattedValue = typeof nestedValue === 'string' ? `'${nestedValue}'` : nestedValue;
              return `    ${nestedKey}: ${formattedValue}`;
            });
            const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
            return `  ${formattedKey}: {\n${nestedEntries.join(',\n')}\n  }`;
          }
        } else {
          // 일반적인 값들
          if (value === '__TEMPLATE_LITERAL__' || value === '__COMPLEX_EXPRESSION__') {
            return `${indent}  ${key}: /* 원본 값 보존 필요 */`;
          }
          const formattedValue = typeof value === 'string' ? `'${value}'` : value;
          return `${indent}  ${key}: ${formattedValue}`;
        }
      });

      return `{\n${entries.join(',\n')}\n${indent}}`;
    }

    /**
     * style() 호출을 처리
     */
    function handleStyleCall(node, messageId = 'preferSprinkles') {
      if (node.callee.name !== 'style' || node.arguments.length === 0) return;

      const firstArg = node.arguments[0];

      // 배열 형태의 style() 호출 처리
      if (firstArg.type === 'ArrayExpression') {
        return handleArrayStyleCall(node, firstArg, messageId);
      }

      // 객체 형태의 style() 호출 처리
      if (firstArg.type === 'ObjectExpression') {
        return handleObjectStyleCall(node, firstArg, messageId);
      }
    }

    /**
     * 배열 형태의 style() 호출을 처리
     * 예: style([flex, { width: '100%' }])
     */
    function handleArrayStyleCall(node, arrayArg, messageId) {
      let hasSprinklesProps = false;
      const sprinklesPropsArray = [];
      const remainingPropsArray = [];
      const otherElements = []; // 객체가 아닌 다른 요소들 (변수, 함수 호출 등)
      let existingSprinklesProps = {};

      // 배열의 각 요소를 검사
      arrayArg.elements.forEach((element, index) => {
        // 기존 sprinkles() 호출이 있는 경우 내용 추출
        if (element && element.type === 'CallExpression' && element.callee.name === 'sprinkles') {
          if (element.arguments.length > 0 && element.arguments[0].type === 'ObjectExpression') {
            existingSprinklesProps = extractObjectProperties(element.arguments[0], sourceCode);
          }
          return;
        }

        // 객체 표현식이 아닌 요소들 (변수, 함수 호출 등) 보존
        if (element && element.type !== 'ObjectExpression') {
          otherElements.push({
            index,
            text: sourceCode.getText(element)
          });
          return;
        }

        if (element && element.type === 'ObjectExpression') {
          const properties = extractObjectProperties(element, sourceCode);
          const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

          if (Object.keys(sprinklesProps).length > 0) {
            hasSprinklesProps = true;
            sprinklesPropsArray.push(sprinklesProps);

            if (Object.keys(remainingProps).length > 0) {
              remainingPropsArray.push(remainingProps);
            }
          } else if (Object.keys(properties).length > 0) {
            remainingPropsArray.push(properties);
          }
        }
      });

      // 새로운 sprinkles 속성이 있을 때만 보고
      if (hasSprinklesProps) {
        const allNewSprinklesProps = Object.keys(sprinklesPropsArray.flatMap(obj => Object.keys(obj)));

        context.report({
          node,
          messageId,
          data: {
            properties: allNewSprinklesProps.join(', ')
          },
          fix(fixer) {
            // 기존 sprinkles와 새로운 sprinkles 속성을 병합
            let mergedSprinklesProps = { ...existingSprinklesProps };
            sprinklesPropsArray.forEach(props => {
              mergedSprinklesProps = { ...mergedSprinklesProps, ...props };
            });

            // 배열 요소들을 재구성
            const arrayElements = [];

            // 다른 요소들 (변수, 함수 호출 등) 먼저 추가
            otherElements.forEach(element => {
              arrayElements.push(element.text);
            });

            // sprinkles 추가 (기존 sprinkles가 있었거나 새로운 sprinkles 속성이 있는 경우)
            if (Object.keys(mergedSprinklesProps).length > 0) {
              const sprinklesStr = `sprinkles(${objectToString(mergedSprinklesProps)})`;
              arrayElements.push(sprinklesStr);
            }

            // 남은 객체 속성들 추가
            remainingPropsArray.forEach(props => {
              arrayElements.push(objectToString(props));
            });

            // 배열이 비어있지 않은 경우에만 수정
            if (arrayElements.length > 0) {
              const newCode = `style([${arrayElements.join(', ')}])`;
              return fixer.replaceText(node, newCode);
            }
          }
        });
      }
    }

    /**
     * 객체 형태의 style() 호출을 처리
     * 예: style({ width: '100%' })
     */
    function handleObjectStyleCall(node, objectArg, messageId) {
      const properties = extractObjectProperties(objectArg, sourceCode);
      const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

      if (Object.keys(sprinklesProps).length > 0) {
        context.report({
          node,
          messageId,
          data: {
            properties: Object.keys(sprinklesProps).join(', ')
          },
          fix(fixer) {
            const hasRemainingProps = Object.keys(remainingProps).length > 0;

            if (hasRemainingProps) {
              // sprinkles와 style을 조합하는 형태로 변경
              const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
              const styleStr = objectToString(remainingProps, objectArg);
              const newCode = `style([${sprinklesStr}, ${styleStr}])`;
              return fixer.replaceText(node, newCode);
            } else {
              // 모든 속성이 sprinkles로 이동 가능한 경우
              const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
              return fixer.replaceText(node, newCode);
            }
          }
        });
      }
    }

    /**
     * styleVariants 내의 style() 호출을 처리
     */
    function handleStyleVariants(node) {
      if (node.callee.name !== 'styleVariants' || node.arguments.length === 0) return;

      const firstArg = node.arguments[0];
      if (firstArg.type !== 'ObjectExpression') return;

      // 각 variant를 순회하며 style() 호출 확인
      firstArg.properties.forEach(prop => {
        if (prop.type !== 'Property') return;

        // 배열 형태의 variant 값 처리
        if (prop.value.type === 'ArrayExpression') {
          prop.value.elements.forEach(element => {
            if (element && element.type === 'CallExpression') {
              handleStyleCall(element, 'preferSprinklesInVariants');
            } else if (element && element.type === 'ObjectExpression') {
              // 배열 내 객체 표현식 직접 처리
              const properties = extractObjectProperties(element, sourceCode);
              const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

              if (Object.keys(sprinklesProps).length > 0) {
                context.report({
                  node: element,
                  messageId: 'preferSprinklesInVariants',
                  data: {
                    properties: Object.keys(sprinklesProps).join(', ')
                  },
                  fix(fixer) {
                    const hasRemainingProps = Object.keys(remainingProps).length > 0;

                    if (hasRemainingProps) {
                      const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
                      const styleStr = objectToString(remainingProps);
                      const newCode = `style([${sprinklesStr}, ${styleStr}])`;
                      return fixer.replaceText(element, newCode);
                    } else {
                      const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
                      return fixer.replaceText(element, newCode);
                    }
                  }
                });
              }
            }
          });
        }
        // 직접적인 style() 호출 처리
        else if (prop.value.type === 'CallExpression') {
          handleStyleCall(prop.value, 'preferSprinklesInVariants');
        }
      });
    }

    /**
     * recipe 내의 style 속성들을 처리
     */
    function handleRecipe(node) {
      if (node.callee.name !== 'recipe' || node.arguments.length === 0) return;

      const firstArg = node.arguments[0];
      if (firstArg.type !== 'ObjectExpression') return;

      // recipe의 base, variants 등에서 style() 호출 확인
      firstArg.properties.forEach(prop => {
        if (prop.type !== 'Property') return;

        const key = prop.key.name;

        // base 속성 처리
        if (key === 'base') {
          if (prop.value.type === 'CallExpression') {
            handleStyleCall(prop.value, 'preferSprinklesInRecipe');
          } else if (prop.value.type === 'ArrayExpression') {
            prop.value.elements.forEach(element => {
              if (element && element.type === 'CallExpression') {
                handleStyleCall(element, 'preferSprinklesInRecipe');
              } else if (element && element.type === 'ObjectExpression') {
                // 배열 내 객체 표현식 직접 처리
                const properties = extractObjectProperties(element, sourceCode);
                const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

                if (Object.keys(sprinklesProps).length > 0) {
                  context.report({
                    node: element,
                    messageId: 'preferSprinklesInRecipe',
                    data: {
                      properties: Object.keys(sprinklesProps).join(', ')
                    },
                    fix(fixer) {
                      const hasRemainingProps = Object.keys(remainingProps).length > 0;

                      if (hasRemainingProps) {
                        const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
                        const styleStr = objectToString(remainingProps);
                        const newCode = `style([${sprinklesStr}, ${styleStr}])`;
                        return fixer.replaceText(element, newCode);
                      } else {
                        const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
                        return fixer.replaceText(element, newCode);
                      }
                    }
                  });
                }
              }
            });
          } else if (prop.value.type === 'ObjectExpression') {
            // 직접 객체 표현식 처리
            const properties = extractObjectProperties(prop.value, sourceCode);
            const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

            if (Object.keys(sprinklesProps).length > 0) {
              context.report({
                node: prop.value,
                messageId: 'preferSprinklesInRecipe',
                data: {
                  properties: Object.keys(sprinklesProps).join(', ')
                },
                fix(fixer) {
                  const hasRemainingProps = Object.keys(remainingProps).length > 0;

                  if (hasRemainingProps) {
                    const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
                    const styleStr = objectToString(remainingProps);
                    const newCode = `style([${sprinklesStr}, ${styleStr}])`;
                    return fixer.replaceText(prop.value, newCode);
                  } else {
                    const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
                    return fixer.replaceText(prop.value, newCode);
                  }
                }
              });
            }
          }
        }

        // variants 속성 처리
        if (key === 'variants' && prop.value.type === 'ObjectExpression') {
          prop.value.properties.forEach(variantProp => {
            if (variantProp.type !== 'Property') return;

            if (variantProp.value.type === 'ObjectExpression') {
              variantProp.value.properties.forEach(variantValueProp => {
                if (variantValueProp.type !== 'Property') return;

                // style() 호출 처리
                if (variantValueProp.value.type === 'CallExpression') {
                  handleStyleCall(variantValueProp.value, 'preferSprinklesInRecipe');
                }
                // 배열 형태 처리 (예: [baseStyle, { width: '100%' }])
                else if (variantValueProp.value.type === 'ArrayExpression') {
                  variantValueProp.value.elements.forEach(element => {
                    if (element && element.type === 'CallExpression') {
                      handleStyleCall(element, 'preferSprinklesInRecipe');
                    } else if (element && element.type === 'ObjectExpression') {
                      // 배열 내 객체 표현식 직접 처리
                      const properties = extractObjectProperties(element, sourceCode);
                      const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

                      if (Object.keys(sprinklesProps).length > 0) {
                        context.report({
                          node: element,
                          messageId: 'preferSprinklesInRecipe',
                          data: {
                            properties: Object.keys(sprinklesProps).join(', ')
                          },
                          fix(fixer) {
                            const hasRemainingProps = Object.keys(remainingProps).length > 0;

                            if (hasRemainingProps) {
                              const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
                              const styleStr = objectToString(remainingProps);
                              const newCode = `style([${sprinklesStr}, ${styleStr}])`;
                              return fixer.replaceText(element, newCode);
                            } else {
                              const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
                              return fixer.replaceText(element, newCode);
                            }
                          }
                        });
                      }
                    }
                  });
                }
                // 직접 객체 표현식 처리
                else if (variantValueProp.value.type === 'ObjectExpression') {
                  const properties = extractObjectProperties(variantValueProp.value, sourceCode);
                  const { sprinklesProps, remainingProps } = extractSprinklesProperties(properties);

                  if (Object.keys(sprinklesProps).length > 0) {
                    context.report({
                      node: variantValueProp.value,
                      messageId: 'preferSprinklesInRecipe',
                      data: {
                        properties: Object.keys(sprinklesProps).join(', ')
                      },
                      fix(fixer) {
                        const hasRemainingProps = Object.keys(remainingProps).length > 0;

                        if (hasRemainingProps) {
                          const sprinklesStr = `sprinkles(${objectToString(sprinklesProps)})`;
                          const styleStr = objectToString(remainingProps, variantValueProp.value);
                          const newCode = `style([${sprinklesStr}, ${styleStr}])`;
                          return fixer.replaceText(variantValueProp.value, newCode);
                        } else {
                          const newCode = `sprinkles(${objectToString(sprinklesProps)})`;
                          return fixer.replaceText(variantValueProp.value, newCode);
                        }
                      }
                    });
                  }
                }
              });
            }
          });
        }
      });
    }

    return {
      CallExpression(node) {
        switch (node.callee.name) {
          case 'style':
            handleStyleCall(node);
            break;
          case 'styleVariants':
            handleStyleVariants(node);
            break;
          case 'recipe':
            handleRecipe(node);
            break;
        }
      }
    };
  }
};