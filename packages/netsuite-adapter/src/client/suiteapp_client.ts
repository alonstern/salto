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
// import Bottleneck from 'bottleneck'
import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import axios, { AxiosResponse } from 'axios'
import { logger } from '@salto-io/logging'
import { Credentials } from './credentials'


const CONSUMER_KEY = '3db2f2ec0bd98c4eee526ea0b8da876d1d739597e50ee593c67c0f2c34294073'
const CONSUMER_SECRET = '4c8399c03043f4ff2889610d260fc76037d126c840f83b3e6a4e6f4ddf3b0b79'
const PAGE_SIZE = 1000

type HttpMethod = 'POST' | 'GET'

const log = logger(module)

export type SuiteAppClientParameters = {
  credentials: Credentials
  // callsLimiter: Bottleneck
}

export type SavedSearchQuery = {
  type: string
  columns: string[]
  filters: string[][]
}

export class SuiteAppClient {
  private credentials: Credentials
  // private callsLimiter: Bottleneck
  private suiteQLUrl: URL
  private savedSearchUrl: URL

  constructor(params: SuiteAppClientParameters) {
    this.credentials = params.credentials
    // this.callsLimiter = params.callsLimiter
    this.suiteQLUrl = new URL(`https://${params.credentials.accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`)
    this.savedSearchUrl = new URL(`https://${params.credentials.accountId}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_salto_search_restlet&deploy=customdeploy_salto_search_restlet`)
  }

  public async runSuiteQL(query: string):
    Promise<Record<string, string>[] | undefined> {
    let hasMore = true
    const items: Record<string, string>[] = []
    for (let offset = 0; hasMore; offset += PAGE_SIZE) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await this.sendSuiteQLRequest(query, offset, PAGE_SIZE)
        items.push(...response.data.items)
        hasMore = response.data.hasMore
      } catch (error) {
        log.error('SuiteQL query error', { error })
        return undefined
      }
    }
    return items
  }

  public async runSavedSearchQuery(query: SavedSearchQuery):
    Promise<Record<string, string>[] | undefined> {
    let hasMore = true
    const items: Record<string, string>[] = []
    for (let offset = 0; hasMore; offset += 1000) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await this.sendSavedSearchRequest(query, offset, PAGE_SIZE)
        if (response.data.status === 'error') {
          log.error('Saved search query error', { responseData: response.data })
          return undefined
        }
        items.push(...response.data.results)
        hasMore = response.data.results.length === 1000
      } catch (error) {
        log.error('Saved search query error', { error })
        return undefined
      }
    }
    return items
  }


  private async sendSuiteQLRequest(query: string, offset: number, limit: number):
  Promise<AxiosResponse> {
    const url = new URL(this.suiteQLUrl.href)
    url.searchParams.append('limit', limit.toString())
    url.searchParams.append('offset', offset.toString())

    const headers = {
      ...this.generateAuthHeader(url, 'POST'),
      prefer: 'transient',
      'Content-Type': 'application/json',
    }
    return axios.post(
      url.href,
      { q: query },
      { headers },
    )
  }

  private async sendSavedSearchRequest(query: SavedSearchQuery, offset: number, limit: number):
  Promise<AxiosResponse> {
    const headers = {
      ...this.generateAuthHeader(this.savedSearchUrl, 'POST'),
      'Content-Type': 'application/json',
    }
    return axios.post(
      this.savedSearchUrl.href,
      {
        ...query,
        offset,
        limit,
      },
      { headers },
    )
  }

  private generateAuthHeader(url: URL, method: HttpMethod): OAuth.Header {
    const oauth = new OAuth({
      consumer: {
        key: CONSUMER_KEY,
        secret: CONSUMER_SECRET,
      },
      realm: this.credentials.accountId,
      // eslint-disable-next-line @typescript-eslint/camelcase
      signature_method: 'HMAC-SHA256',
      // eslint-disable-next-line @typescript-eslint/camelcase
      hash_function(base_string, key) {
        return crypto.createHmac('sha256', key).update(base_string).digest('base64')
      },
    })

    const requestData = {
      url: url.href,
      method,
    }

    const token = {
      key: this.credentials.tokenId,
      secret: this.credentials.tokenSecret,
    }

    return oauth.toHeader(oauth.authorize(requestData, token))
  }
}
