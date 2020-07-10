// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import 'bootstrap';

import React from 'react';
import {Route, Switch, Redirect} from 'react-router-dom';

import {ActionFunc} from 'mattermost-redux/types/actions';
import {AdminConfig, EnvironmentConfig, ClientLicense} from 'mattermost-redux/types/config';
import {Role} from 'mattermost-redux/types/roles';
import {ConsoleAccess} from 'mattermost-redux/types/admin';
import {Dictionary} from 'mattermost-redux/types/utilities';

import AnnouncementBar from 'components/announcement_bar';
import SystemNotice from 'components/system_notice';
import ModalController from 'components/modal_controller';

import SchemaAdminSettings from 'components/admin_console/schema_admin_settings';
import DiscardChangesModal from 'components/discard_changes_modal';

import AdminSidebar from './admin_sidebar';
import Highlight from './highlight';
import AdminDefinition from './admin_definition';

type Props = {
    config: DeepPartial<AdminConfig>;
    adminDefinition: typeof AdminDefinition;
    environmentConfig?: Partial<EnvironmentConfig>;
    license: ClientLicense;
    unauthorizedRoute: string;
    buildEnterpriseReady: boolean;
    roles: Dictionary<Role>;
    match: { url: string };
    showNavigationPrompt: boolean;
    isCurrentUserSystemAdmin: boolean;
    currentUserHasAnAdminRole: boolean;
    consoleAccess: ConsoleAccess;
    actions: {
        getConfig: () => ActionFunc;
        getEnvironmentConfig: () => ActionFunc;
        setNavigationBlocked: () => void;
        confirmNavigation: () => void;
        cancelNavigation: () => void;
        loadRolesIfNeeded: (roles: Iterable<string>) => ActionFunc;
        selectChannel: (channelId: string) => void;
        selectTeam: (teamId: string) => void;
        editRole: (role: Role) => void;
        updateConfig?: (config: AdminConfig) => ActionFunc;
    };
}

type State = {
    filter: string;
}

// not every page in the system console will need the license and config, but the vast majority will
type ExtraProps = {
    license?: Record<string, any>;
    config?: DeepPartial<AdminConfig>;
    environmentConfig?: Partial<EnvironmentConfig>;
    setNavigationBlocked?: () => void;
    roles?: {
        [x: string]: string | object;
    };
    editRole?: (role: Role) => void;
    updateConfig?: (config: AdminConfig) => ActionFunc;
}

type Item = {
    isHidden?: (config?: Record<string, any>, state?: Record<string, any>, license?: Record<string, any>, buildEnterpriseReady?: boolean, consoleAccess?: ConsoleAccess) => boolean;
    isDisabled?: (config?: Record<string, any>, state?: Record<string, any>, license?: Record<string, any>, buildEnterpriseReady?: boolean, consoleAccess?: ConsoleAccess) => boolean;
    schema: Record<string, any>;
    url: string;
}

export default class AdminConsole extends React.PureComponent<Props, State> {
    public constructor(props: Props) {
        super(props);
        this.state = {
            filter: '',
        };
    }

    public componentDidMount(): void {
        this.props.actions.getConfig();
        this.props.actions.getEnvironmentConfig();
        this.props.actions.loadRolesIfNeeded(['channel_user', 'team_user', 'system_user', 'channel_admin', 'team_admin', 'system_admin', 'system_user_manager', 'system_read_only_admin', 'system_restricted_admin']); // expand the system admin roles from a constant
        this.props.actions.selectChannel('');
        this.props.actions.selectTeam('');
    }

    private onFilterChange = (filter: string) => {
        this.setState({filter});
    }

    private mainRolesLoaded(roles: Dictionary<Role>) {
        return (
            roles &&
            roles.channel_admin &&
            roles.channel_user &&
            roles.team_admin &&
            roles.team_user &&
            roles.system_admin &&
            roles.system_user &&
            roles.system_user_manager &&
            roles.system_read_only_admin &&
            roles.system_restricted_admin
        );
    }

    private renderRoutes = (extraProps: ExtraProps) => {
        const schemas: Item[] = Object.values(this.props.adminDefinition).reduce((acc, section) => {
            let items: Item[] = [];

            let isSectionHidden = false;
            Object.entries(section).find((entry) => {
                if (entry[0] === 'isHidden') {
                    if (typeof entry[1] === 'function') {
                        const isHiddenFunc = entry[1] as ((config?: Record<string, any>, state?: Record<string, any>, license?: Record<string, any>, buildEnterpriseReady?: boolean, consoleAccess?: ConsoleAccess) => boolean);
                        isSectionHidden = isHiddenFunc(this.props.config, {}, this.props.license, this.props.buildEnterpriseReady, this.props.consoleAccess);
                    } else {
                        isSectionHidden = entry[1];
                    }
                }
                return null;
            });

            if (!isSectionHidden) {
                items = Object.values(section).filter((item: Item) => {
                    if (!item.schema) {
                        return false;
                    }
                    return true;
                });
            }
            return acc.concat(items);
        }, [] as Item[]);
        const schemaRoutes = schemas.map((item: Item) => {
            let isItemDisabled: boolean;

            if (typeof item.isDisabled === 'function') {
                isItemDisabled = item.isDisabled(this.props.config, this.state, this.props.license, this.props.buildEnterpriseReady, this.props.consoleAccess);
            } else {
                isItemDisabled = Boolean(item.isDisabled);
            }

            return (
                <Route
                    key={item.url}
                    path={`${this.props.match.url}/${item.url}`}
                    render={(props) => (
                        <SchemaAdminSettings
                            {...extraProps}
                            {...props}
                            consoleAccess={this.props.consoleAccess}
                            schema={item.schema}
                            isDisabled={isItemDisabled}
                        />
                    )}
                />
            );
        });
        const defaultUrl = schemas[0].url;

        return (
            <Switch>
                {schemaRoutes}
                {<Redirect to={`${this.props.match.url}/${defaultUrl}`}/>}
            </Switch>
        );
    }

    public render(): JSX.Element | null {
        const {
            license,
            config,
            environmentConfig,
            showNavigationPrompt,
            roles,
        } = this.props;
        const {setNavigationBlocked, cancelNavigation, confirmNavigation, editRole, updateConfig} = this.props.actions;

        if (!this.props.currentUserHasAnAdminRole) {
            return (
                <Redirect to={this.props.unauthorizedRoute}/>
            );
        }

        if (!this.mainRolesLoaded(this.props.roles)) {
            return null;
        }

        if (Object.keys(config).length === 0) {
            return <div/>;
        }

        if (config && Object.keys(config).length === 0 && config.constructor === Object) {
            return (
                <div className='admin-console__wrapper'>
                    <AnnouncementBar/>
                    <div className='admin-console'/>
                </div>
            );
        }

        const discardChangesModal: JSX.Element = (
            <DiscardChangesModal
                show={showNavigationPrompt}
                onConfirm={confirmNavigation}
                onCancel={cancelNavigation}
            />
        );

        const extraProps: ExtraProps = {
            license,
            config,
            environmentConfig,
            setNavigationBlocked,
            roles,
            editRole,
            updateConfig,
        };
        return (
            <div
                className='admin-console__wrapper'
                id='adminConsoleWrapper'
            >
                <AnnouncementBar/>
                <SystemNotice/>
                <AdminSidebar onFilterChange={this.onFilterChange}/>
                <div className='admin-console'>
                    <Highlight filter={this.state.filter}>
                        {this.renderRoutes(extraProps)}
                    </Highlight>
                </div>
                {discardChangesModal}
                <ModalController/>
            </div>
        );
    }
}
