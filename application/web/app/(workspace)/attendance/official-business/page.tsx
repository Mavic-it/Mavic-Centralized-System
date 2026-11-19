import { ObPageLoading } from "../../../attendance/official-business/ob-loading";
import {Suspense} from 'react';
import AuthorizedWorkspacePage from '../../../components/authorized-workspace-page';
import {OfficialBusinessEntry} from '../../../attendance/official-business/entry';
export default function OfficialBusinessPage(){return <AuthorizedWorkspacePage access="portal" returnPath="/attendance/official-business"><Suspense fallback={<ObPageLoading />}><OfficialBusinessEntry/></Suspense></AuthorizedWorkspacePage>;}
