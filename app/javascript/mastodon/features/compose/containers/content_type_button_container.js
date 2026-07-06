import { injectIntl, defineMessages } from 'react-intl';

import { connect } from 'react-redux';

import { changeComposeContentType } from '../../../actions/compose';
import TextIconButton from '../components/text_icon_button';

const messages = defineMessages({
  markdown_enabled: { id: 'compose_form.content_type.markdown_enabled', defaultMessage: 'Markdown formatting is enabled' },
  markdown_disabled: { id: 'compose_form.content_type.markdown_disabled', defaultMessage: 'Markdown formatting is disabled' },
});

const mapStateToProps = (state, { intl }) => {
  const active = state.getIn(['compose', 'content_type']) === 'text/markdown';

  return {
    label: 'M',
    title: intl.formatMessage(active ? messages.markdown_enabled : messages.markdown_disabled),
    active,
  };
};

const mapDispatchToProps = dispatch => ({

  onClick () {
    dispatch((_, getState) => {
      const active = getState().getIn(['compose', 'content_type']) === 'text/markdown';
      dispatch(changeComposeContentType(active ? 'text/plain' : 'text/markdown'));
    });
  },

});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(TextIconButton));
