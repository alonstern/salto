/*
*                      Copyright 2020 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import {
  BuiltinTypes,
  CORE_ANNOTATIONS,
  Element,
  ElemID,
  InstanceElement,
  isEqualElements,
  isType,
  ObjectType,
  PrimitiveType,
  PrimitiveTypes,
} from '@salto-io/adapter-api'
import mockClient from '../client'
import {
  FilterWith,
} from '../../src/filter'
import filterCreator from '../../src/filters/hide_types'
import {
  RECORDS_PATH,
  CUSTOM_OBJECT,
  INSTANCE_FULL_NAME_FIELD,
  METADATA_TYPE,
  SALESFORCE,
  FIELD_ANNOTATIONS,
  DEFAULT_VALUE_FORMULA,
  API_NAME,
} from '../../src/constants'
import {
  isCustomObject,
} from '../../src/transformers/transformer'

describe('hide_types filter', () => {
  const { client } = mockClient()


  const mockCustomObj = new ObjectType({
    elemID: new ElemID(SALESFORCE, 'Test'),
    fields: {
      [INSTANCE_FULL_NAME_FIELD]: { type: BuiltinTypes.STRING },
      pluralLabel: { type: BuiltinTypes.STRING },
      enableFeeds: { type: BuiltinTypes.BOOLEAN },
    },
    annotations: {
      [METADATA_TYPE]: CUSTOM_OBJECT,
      [API_NAME]: 'Test__c',
    },
  })

  const mockType = new ObjectType({
    elemID: new ElemID(SALESFORCE, 'mockType'),
    fields: {
      [INSTANCE_FULL_NAME_FIELD]: { type: BuiltinTypes.SERVICE_ID },
    },
    annotationTypes: {},
    annotations: {
      [METADATA_TYPE]: 'mockMetadata',
    },
  })

  const mockPrimitive = new PrimitiveType(
    {
      elemID: new ElemID(SALESFORCE, 'mockPrimitive'),
      primitive: PrimitiveTypes.NUMBER,
      annotationTypes: {
        [FIELD_ANNOTATIONS.UNIQUE]: BuiltinTypes.BOOLEAN,
        [FIELD_ANNOTATIONS.EXTERNAL_ID]: BuiltinTypes.BOOLEAN,
        [DEFAULT_VALUE_FORMULA]: BuiltinTypes.STRING,
      },
    }
  )


  const instanceName = 'mockInstance'

  const mockInstance = new InstanceElement(
    instanceName,
    mockType,
    {
      [INSTANCE_FULL_NAME_FIELD]: instanceName,
    },
    [RECORDS_PATH, 'mockType', instanceName],
  )


  let elements: Element[]


  describe('when enableHideTypesInNacls is true', () => {
    const filter = filterCreator(
      { client, config: { enableHideTypesInNacls: true } }
    ) as FilterWith<'onFetch'>


    let type: ObjectType
    let customObj: ObjectType
    let primitiveType: PrimitiveType
    let instance: InstanceElement


    beforeAll(async () => {
      elements = [
        mockCustomObj.clone(),
        mockType.clone(),
        mockInstance.clone(),
        mockPrimitive.clone(),
      ]

      await filter.onFetch(elements)

      // Elements after filter execution
      instance = elements.find(e => e.elemID.isEqual(mockInstance.elemID)) as InstanceElement
      type = elements.find(e => e.elemID.isEqual(mockType.elemID)) as ObjectType
      customObj = elements.find(e => e.elemID.isEqual(mockCustomObj.elemID)) as ObjectType
      primitiveType = elements.find(e => e.elemID.isEqual(mockPrimitive.elemID)) as PrimitiveType
    })

    it('should not change element list length', () => {
      expect(elements).toHaveLength(4)
    })


    it('should not change instances', () => {
      expect(isEqualElements(instance, mockInstance)).toBeTruthy()
      expect(instance.annotations[CORE_ANNOTATIONS.HIDDEN]).toBeUndefined()
    })

    it('should not change custom object', () => {
      expect(isEqualElements(customObj, mockCustomObj)).toBeTruthy()
      expect(customObj.annotations[CORE_ANNOTATIONS.HIDDEN]).toBeUndefined()
    })

    it('should add hidden annotation to types', () => {
      // Type should changed
      expect(isEqualElements(type, mockType)).toBeFalsy()
      expect(isEqualElements(primitiveType, mockPrimitive)).toBeFalsy()

      expect(elements
        .filter(e => !isCustomObject(e))
        .filter(isType).every(e => e.annotations[CORE_ANNOTATIONS.HIDDEN] === true))
        .toBeTruthy()
    })


    it('should add hidden as true for non custom object types and primitives', () => {
      expect(type.annotations[CORE_ANNOTATIONS.HIDDEN]).toEqual(true)
      expect(primitiveType.annotations[CORE_ANNOTATIONS.HIDDEN]).toEqual(true)
    })
  })


  describe('when enableHideTypesInNacls is false', () => {
    const filter = filterCreator(
      { client, config: { enableHideTypesInNacls: false } }
    ) as FilterWith<'onFetch'>


    beforeAll(async () => {
      elements = [
        mockCustomObj.clone(),
        mockType.clone(),
        mockInstance.clone(),
        mockPrimitive.clone(),
      ]

      await filter.onFetch(elements)
    })


    it('should not change element list length', () => {
      expect(elements).toHaveLength(4)
    })


    it('should not add hidden annotation when enableHideTypesInNacls is false', () => {
      expect(elements.every(element => element.annotations[CORE_ANNOTATIONS.HIDDEN] === undefined))
        .toBeTruthy()
    })
  })
})
