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
import { SuiteAppClient } from '../client/suiteapp_client/suiteapp_client'
import { NetsuiteQuery } from '../query'
import { getChangedFiles, getChangedFolders } from './file_cabinet_changes'
import { formatSavedSearchDate } from './formats'
import { DateRange } from './types'

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
  _query: NetsuiteQuery,
  dateRange: DateRange
): Promise<NetsuiteQuery> => {
  const changedInternalIds = await getChangedInternalIds(client, dateRange)

  log.debug('Starting to look for changed objects')
  const paths = new Set(
    [
      ...await getChangedFiles(client, dateRange),
      ...await getChangedFolders(client, dateRange),
    ]
      .filter(({ internalId }) => changedInternalIds.has(internalId))
      .map(({ externalId }) => externalId)
  )
  // eslint-disable-next-line no-console
  console.log(paths)

  // eslint-disable-next-line no-console
  console.log(changedInternalIds)

  return {
    isTypeMatch: () => true,
    isObjectMatch: () => true,
    isFileMatch: filePath => paths.has(filePath),
  }
}
