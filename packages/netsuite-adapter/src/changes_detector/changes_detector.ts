/*
*                      Copyright 2021 Salto Labs Ltd.
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
import { logger } from '@salto-io/logging'
import _ from 'lodash'
import { SuiteAppClient } from '../client/suiteapp_client/suiteapp_client'
import { NetsuiteQuery } from '../query'
import { getChangedFiles, getChangedFolders } from './changes_detectors/file_cabinet'
import customRecordTypeDetector from './changes_detectors/custom_record_type'
import customFieldDetector from './changes_detectors/custom_field'
import scriptDetector from './changes_detectors/script'
import roleDetector from './changes_detectors/role'
import { formatSavedSearchDate } from './formats'
import { ChangedType, DateRange } from './types'

const log = logger(module)


const getChangedInternalIds = async (client: SuiteAppClient, dateRange: DateRange):
Promise<Set<number>> => {
  const results = await client.runSavedSearchQuery({
    type: 'systemnote',
    filters: [
      ['date', 'within', formatSavedSearchDate(dateRange.start), formatSavedSearchDate(dateRange.end)],
    ],
    columns: ['recordid'],
  })

  if (results === undefined) {
    log.warn('file changes query failed')
    return new Set()
  }

  return new Set(
    results
      .filter((res): res is { recordid: string } => {
        if (typeof res.recordid !== 'string') {
          log.warn('Got invalid result from system note query, %o', res)
          return false
        }
        return true
      })
      .map(res => parseInt(res.recordid, 10))
  )
}

export const getChangedObjects = async (
  client: SuiteAppClient,
  query: NetsuiteQuery,
  dateRange: DateRange
): Promise<NetsuiteQuery> => {
  log.debug('Starting to look for changed objects')

  const instancesChangesPromise = Promise.all(
    [
      customRecordTypeDetector,
      customFieldDetector,
      roleDetector,
      scriptDetector,
    ].filter(detector => detector.getTypes().some(query.isTypeMatch))
      .map(detector => detector.getChanges(client, dateRange))
  ).then(output => output.flat())

  const fileChangesPromise = Promise.all([
    getChangedFiles(client, dateRange),
    getChangedFolders(client, dateRange),
  ]).then(output => output.flat())

  const [
    changedInternalIds,
    changedInstances,
    changedFiles,
  ] = await Promise.all([
    getChangedInternalIds(client, dateRange),
    instancesChangesPromise,
    fileChangesPromise,
  ])

  const paths = new Set(
    changedFiles.filter(
      ({ internalId }) => changedInternalIds.has(internalId)
    ).map(({ externalId }) => externalId)
  )


  const [changedTypes, changedObjects] = _.partition(changedInstances, (change): change is ChangedType => change.type === 'type')

  const scriptIds = new Set(
    changedObjects.filter(
      ({ internalId }) => internalId === undefined || changedInternalIds.has(internalId)
    ).map(({ externalId }) => externalId)
  )

  const types = new Set(changedTypes.map(type => type.name))
  // eslint-disable-next-line no-console
  console.log(paths)

  // eslint-disable-next-line no-console
  console.log(changedInternalIds)

  // eslint-disable-next-line no-console
  console.log(scriptIds)

  // eslint-disable-next-line no-console
  console.log(types)

  return {
    isTypeMatch: () => true,
    isObjectMatch: objectID => scriptIds.has(objectID.scriptId) || types.has(objectID.type),
    isFileMatch: filePath => paths.has(filePath),
  }
}
